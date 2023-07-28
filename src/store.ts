import type { Compiler, CompilerOptions, DesignOutput, DesignSpec, SpecData } from './token.js';
import { readSpec } from './loader.js';
import { createAnimationMap, createDesignMap, createTokenMap, RESTRICTED_SPEC_KEYS } from './parser.js';
import { dirname, join } from 'path';
import { FSWatcher, watch } from 'chokidar';
import fs from 'fs-extra';

export type SpecIndex = {
  name: string;
  version?: string;
  url: string;
  file: string;
  spec: DesignSpec;
  data: SpecData;

  parentIndex?: SpecIndex;
  extendedIndexes: SpecIndex[];
  includedIndexes: SpecIndex[];
}

export type StoreEvent = {
  type: 'change' | 'index:ready' | 'index:reindex' | 'watch' | 'unwatch' | 'compile:start' | 'compile:complete' | 'fs:write' | 'fs:read';
  data?: SpecIndex | DesignOutput[] | string | string[];
}

export type CompileEvent = {
  type: 'compile:start' | 'compile:complete';
  data: DesignOutput[];
}

export type FSEvent = {
  type: 'fs:write' | 'fs:read';
  data: string;
}

export type WatchEvent = {
  type: 'watch' | 'unwatch';
  data: string;
}

export type Unsubscribe = () => void;
export type OutputWrapper = DesignOutput[] & {
  write: () => void;
}

export class Store {
  public root: SpecIndex = undefined as never;
  public specs: SpecIndex[] = [];
  public indexes: { [key: string]: SpecIndex } = {};

  private watcher?: FSWatcher;
  private watchedPaths: string[] = [];
  private subscribers: Array<(event: StoreEvent) => void> = [];
  private compilers: Compiler[] = [];

  constructor(public rootUrl: string, public options?: CompilerOptions) {}

  public use(compiler: Compiler): this {
    this.compilers.push(compiler);
    return this;
  }

  public async compile(options?: CompilerOptions): Promise<OutputWrapper> {
    const compileOptions = { ...this.options, ...options };
    const outputs: OutputWrapper = [] as never;

    for (const compile of this.compilers) {
      const output = await compile(this.root.spec, compileOptions);
      outputs.push(...output);
    }

    outputs.write = () => {
      for (const output of outputs) {
        if (output.fileName) {
          const fileName = join(process.cwd(), compileOptions?.outDir || '.', output.fileName);

          fs.ensureFileSync(fileName);
          fs.writeFileSync(fileName, output.content, 'utf-8');

          this.emit({ type: 'fs:write', data: fileName } as FSEvent);
        }
      }
    };

    this.emit({ type: 'compile:complete', data: outputs } as CompileEvent);

    return outputs;
  }

  public async run(): Promise<this> {
    if (!this.root) {
      await this.load();
    }

    this.watcher = watch(this.root.file);
    this.watchedPaths.push(this.root.file);
    this.watcher.on('change', async (file) => {
      const now = Date.now();

      console.debug(`Design Spec "${ file }" has been changed.`);
      await this.reindex(file);
      this.emit({ type: 'index:reindex', data: this.indexes[file] });

      if (this.compilers.length) {
        await this.compile();
      }

      console.debug(`Design Spec "${ file }" has been recompiled in ${ Date.now() - now }ms.`);
    });

    this.watch();
    return this;
  }

  public async load(
    url: string = this.rootUrl,
    fromIndex?: SpecIndex,
    recursive = true
  ): Promise<SpecIndex> {
    const {
      spec,
      data,
      pointers,
      path
    } = await readSpec(url, fromIndex?.file ? dirname(fromIndex?.file) : fromIndex?.file, fromIndex?.file);

    if (/[\sA-Z]+/.test(data.name)) {
      console.warn(`Design Spec "${ data.name }" has invalid name. Please use kebab-case.`);

      data.name = data.name.toLowerCase().replace(/\s+/g, '-');
      console.warn(`Design Spec "${ spec.name }" automatically renamed to "${ data.name }".`);
      spec.name = data.name;
    }

    const extendedIndexes: SpecIndex[] = [];
    const includedIndexes: SpecIndex[] = [];
    const index: SpecIndex = {
      name: data.name,
      version: data.version,
      file: path,
      url,
      spec,
      data,
      parentIndex: fromIndex,
      extendedIndexes,
      includedIndexes
    };

    if (!this.indexes[path]) {
      this.indexes[path] = index;
      this.specs.push(index);

      if (url === this.rootUrl) {
        this.root = index;
      }
    }

    spec.id = url;
    spec.url = path;

    spec.pointers = pointers;
    spec.tokenMaps = createTokenMap(spec);
    spec.designMaps = createDesignMap(spec);
    spec.animationMaps = createAnimationMap(spec);

    if (recursive) {
      if (spec.extends?.length) {
        for (const extend of spec.extends) {
          await this.extendIndex(index, extend);
        }
      }

      if (spec.includes?.length) {
        for (const include of spec.includes) {
          await this.includeIndex(index, include);
        }
      }
    }

    this.emit({ type: 'index:ready' });

    return index;
  }

  public async write(url: string) {
    console.debug(this);
  }

  public subscribe(callback: (event: StoreEvent) => void): Unsubscribe {
    this.subscribers.push(callback);

    return () => {
      const index = this.subscribers.indexOf(callback);

      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  private watch() {
    for (const spec of this.specs) {
      if (!this.watchedPaths.includes(spec.file)) {
        this.watchedPaths.push(spec.file);
        this.watcher?.add(spec.file);
        this.emit({ type: 'watch', data: spec.file } as WatchEvent);
      }
    }
  }

  private emit(event: StoreEvent) {
    for (const subscriber of this.subscribers) {
      if (typeof subscriber === 'function') {
        subscriber(event);
      }
    }
  }

  private unwatch(file: string) {
    if (this.watchedPaths.includes(file)) {
      this.watchedPaths.splice(this.watchedPaths.indexOf(file), 1);
      this.watcher?.unwatch(file);
      this.emit({ type: 'unwatch', data: file } as WatchEvent);
    }
  }

  private async reindex(file: string) {
    const previous = this.indexes[file];
    const current = await this.load(previous.url, previous.parentIndex, false);

    await this.mergeExtends(previous, current);
    await this.mergeIncludes(previous, current);

    // Apply new data to previous index.
    previous.name = current.name;
    previous.data = current.data;
    previous.version = current.version;

    for (const [ key, value ] of Object.entries(current.spec)) {
      if (!RESTRICTED_SPEC_KEYS.includes(key as keyof DesignSpec)) {
        previous.spec[key as keyof DesignSpec] = value as never;
      }
    }
  }

  private async mergeExtends(previous: SpecIndex, current: SpecIndex) {
    const removedExtends = getRemovedItem(previous.data.extends || [], current.data.extends || []);
    const addedExtends = getAddedItem(previous.data.extends || [], current.data.extends || []);

    if (removedExtends.length) {
      for (const url of removedExtends) {
        const extendedIndex = previous.extendedIndexes.find(item => item.url === url);
        const extendedSpec = previous.spec.extendedSpecs?.find(item => item.id === url);

        if (extendedIndex) {
          previous.extendedIndexes.splice(previous.extendedIndexes.indexOf(extendedIndex), 1);

          this.unwatch(extendedIndex.file);
          delete this.indexes[extendedIndex.file];

          const extendedIndexPosition = this.specs.indexOf(extendedIndex);
          if (extendedIndexPosition && extendedIndexPosition > -1) {
            this.specs.splice(extendedIndexPosition, 1);
          }
        }

        if (extendedSpec) {
          previous.spec.extendedSpecs?.splice(previous.spec.extendedSpecs?.indexOf(extendedSpec), 1);
        }
      }
    }

    if (addedExtends.length) {
      for (const url of addedExtends) {
        const pos = current.data.extends?.indexOf(url);
        await this.extendIndex(previous, url, pos);
      }

      this.watch();
    }
  }

  private async mergeIncludes(previous: SpecIndex, current: SpecIndex) {
    const removedIncludes = getRemovedItem(previous.data.includes || [], current.data.includes || []);
    const addedIncludes = getAddedItem(previous.data.includes || [], current.data.includes || []);

    if (removedIncludes.length) {
      for (const url of removedIncludes) {
        const includedIndex = previous.includedIndexes.find(item => item.url === url);
        const includeSpec = previous.spec.includedSpecs?.find(item => item.id === url);

        if (includedIndex) {
          previous.includedIndexes.splice(previous.includedIndexes.indexOf(includedIndex), 1);

          this.unwatch(includedIndex.file);
          delete this.indexes[includedIndex.file];

          const includedIndexPosition = this.specs.indexOf(includedIndex);
          if (includedIndexPosition && includedIndexPosition > -1) {
            this.specs.splice(includedIndexPosition, 1);
          }
        }

        if (includeSpec) {
          previous.spec.includedSpecs?.splice(previous.spec.includedSpecs?.indexOf(includeSpec), 1);
        }
      }
    }

    if (addedIncludes.length) {
      for (const url of addedIncludes) {
        const pos = current.data.includes?.indexOf(url);
        await this.includeIndex(previous, url, pos);
      }

      this.watch();
    }
  }

  private async extendIndex(index: SpecIndex, url: string, pos?: number) {
    const { spec } = index;

    const extendedIndex = await this.load(url, index, true);
    const { spec: extendedSpec } = extendedIndex;

    if (!spec.extendedSpecs) {
      spec.extendedSpecs = [];
    }

    if (typeof pos === 'number' && pos > -1) {
      index.extendedIndexes.splice(pos, 0, extendedIndex);
      spec.extendedSpecs.splice(pos, 0, extendedSpec);
    } else {
      index.extendedIndexes.unshift(extendedIndex);
      spec.extendedSpecs.unshift(extendedSpec);
    }
  }

  private async includeIndex(index: SpecIndex, url: string, pos?: number) {
    const { spec } = index;

    const includedIndex = await this.load(url, index, true);
    const { spec: includedSpec } = includedIndex;

    if (!spec.includedSpecs) {
      spec.includedSpecs = [];
    }

    if (typeof pos === 'number' && pos > -1) {
      index.includedIndexes.splice(pos, 0, includedIndex);
      spec.includedSpecs.splice(pos, 0, includedSpec);
    } else {
      index.includedIndexes.push(includedIndex);
      spec.includedSpecs.push(includedSpec);
    }
  }
}

export function getAddedItem(previous: string[], current: string[]) {
  return current.filter(item => !previous.includes(item));
}

export function getRemovedItem(previous: string[], current: string[]) {
  return previous.filter(item => !current.includes(item));
}
