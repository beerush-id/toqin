import { ALLOWED_OVERRIDE_KEYS, readSpec } from './loader.js';
import { createAnimationMap, createDesignMap, createTokenMap, RESTRICTED_SPEC_KEYS } from './parser.js';
import { dirname, join } from 'path';
import { type FSWatcher, watch as watchFile } from 'chokidar';
import fs from 'fs-extra';
import { logger } from './logger.js';
import type { Compiler, CompilerOptions, DesignOutput, DesignSpec, ExternalRef, LoadedDesignSpec } from './core.js';
import { remove } from '@beerush/utils';

export type SpecIndex = {
  name: string;
  version?: string;
  url: string;
  file: string;
  spec: LoadedDesignSpec;
  data: DesignSpec;

  parentIndex?: SpecIndex;
  extendedIndexes: SpecIndex[];
  includedIndexes: SpecIndex[];
  excludedProperties?: string[];
};

export type StoreEvent = {
  type:
    | 'change'
    | 'index:ready'
    | 'index:reindex'
    | 'watch'
    | 'unwatch'
    | 'compile:start'
    | 'compile:complete'
    | 'fs:write'
    | 'fs:read';
  data?: SpecIndex | OutputWrapper | string | string[];
};

export type CompileEvent = {
  type: 'compile:start' | 'compile:complete';
  data: OutputWrapper;
};

export type FSEvent = {
  type: 'fs:write' | 'fs:read';
  data: string;
};

export type WatchEvent = {
  type: 'watch' | 'unwatch';
  data: string;
};

export type Unsubscribe = () => void;
export type OutputWrapper = DesignOutput[] & {
  write: () => void;
  stringify: () => string;
};

export class Store {
  public root: SpecIndex = undefined as never;
  public specs: SpecIndex[] = [];
  public indexes: { [key: string]: SpecIndex } = {};
  public outputs?: OutputWrapper;

  private watcher?: FSWatcher;
  private watchedPaths: string[] = [];
  private subscribers: Array<(event: StoreEvent) => void> = [];
  private compilers: Compiler[] = [];

  constructor(
    public rootUrl: string,
    public options?: CompilerOptions
  ) {}

  public use(compiler: Compiler): this {
    this.compilers.push(compiler);
    return this;
  }

  public async compile(options?: CompilerOptions): Promise<OutputWrapper> {
    const now = Date.now();

    const compileOptions = { ...this.options, ...options } as CompilerOptions;
    const outputs: OutputWrapper = [] as never;

    for (const compile of this.compilers) {
      const output = await compile(this.root.spec, compileOptions);
      outputs.push(...output);
    }

    logger.debug(`Design Spec has been recompiled in ${Date.now() - now}ms.`);

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
    outputs.stringify = () => outputs.map((output) => output.content).join('\n');

    this.outputs = outputs;
    this.emit({ type: 'compile:complete', data: outputs } as CompileEvent);
    return outputs;
  }

  public async run(watch?: boolean): Promise<this> {
    if (!this.root) {
      await this.load();
    }

    if (watch || this.options?.watch) {
      this.watcher = watchFile(this.root.file);
      this.watchedPaths.push(this.root.file);
      this.emit({ type: 'watch', data: this.root.file } as WatchEvent);

      this.watcher.on('change', async (file) => {
        logger.debug(`Design Spec "${file}" has been changed.`);
        await this.reindex(file);
        this.emit({ type: 'index:reindex', data: this.indexes[file] });

        if (this.compilers.length) {
          await this.compile();
        }
      });

      this.watchAll();
    }

    return this;
  }

  public async load(
    url: string = this.rootUrl,
    fromIndex?: SpecIndex,
    recursive = true,
    removePaths?: string[]
  ): Promise<SpecIndex> {
    const { spec, data, pointers, path } = await readSpec(
      url,
      fromIndex?.file ? dirname(fromIndex?.file) : fromIndex?.file,
      fromIndex?.file
    );

    if (/[\sA-Z]+/.test(data.name)) {
      logger.warn(`Design Spec "${data.name}" has invalid name. Please use kebab-case.`);

      data.name = data.name.toLowerCase().replace(/\s+/g, '-');
      logger.warn(`Design Spec "${spec.name}" automatically renamed to "${data.name}".`);
      spec.name = data.name;
    }

    if (fromIndex?.excludedProperties?.length) {
      removePaths = mergeKeys(removePaths || [], fromIndex.excludedProperties);
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
      includedIndexes,
      excludedProperties: removePaths,
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

    if (fromIndex?.spec?.layer && !spec.layer) {
      spec.layer = fromIndex.spec.layer;
    }

    spec.pointers = pointers;
    spec.tokenPointer = pointers['/tokens']?.value;

    if (index.excludedProperties?.length) {
      for (const path of index.excludedProperties) {
        remove<Record<string, unknown>>(spec, path);
      }
    }

    spec.tokenMaps = createTokenMap(spec);
    spec.designMaps = createDesignMap(spec);
    spec.animationMaps = createAnimationMap(spec);

    if (recursive) {
      if (spec.extends?.length) {
        for (const ref of spec.extends) {
          await this.extendIndex(index, ref);
        }
      }

      if (spec.includes?.length) {
        for (const ref of spec.includes) {
          await this.includeIndex(index, ref);
        }
      }
    }

    this.emit({ type: 'index:ready' });

    return index;
  }

  public async write() {
    logger.debug(this);
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

  private watchAll() {
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

    previous.name = current.name;
    previous.version = current.version;
    previous.spec.imports = current.spec.imports;
    previous.excludedProperties = current.excludedProperties;

    await this.mergeExtends(previous, current);
    await this.mergeIncludes(previous, current);

    // Apply new data to previous index.
    previous.data = current.data;

    for (const [key, value] of Object.entries(current.spec)) {
      if (!RESTRICTED_SPEC_KEYS.includes(key as keyof LoadedDesignSpec)) {
        previous.spec[key as keyof LoadedDesignSpec] = value as never;
      }
    }
  }

  private async mergeExtends(previous: SpecIndex, current: SpecIndex) {
    const removedExtends = getRemovedItem(previous.data.extends || [], current.data.extends || []);
    const addedExtends = getAddedItem(previous.data.extends || [], current.data.extends || []);
    const changedExtends = getChangedItem(previous.data.extends || [], current.data.extends || []);

    if (removedExtends.length) {
      for (const ref of removedExtends) {
        const removedIndex = previous.extendedIndexes.find((item) => item.url === ref.url);
        const removedSpec = previous.spec.extendedSpecs?.find((item) => item.id === ref.url);

        if (removedIndex) {
          previous.extendedIndexes.splice(previous.extendedIndexes.indexOf(removedIndex), 1);

          this.unwatch(removedIndex.file);
          delete this.indexes[removedIndex.file];

          const extendedIndexPosition = this.specs.indexOf(removedIndex);
          if (extendedIndexPosition && extendedIndexPosition > -1) {
            this.specs.splice(extendedIndexPosition, 1);
          }
        }

        if (removedSpec) {
          previous.spec.extendedSpecs?.splice(previous.spec.extendedSpecs?.indexOf(removedSpec), 1);
        }
      }
    }

    if (changedExtends.length) {
      // for (const ref of changedExtends) {
      //   const changedIndex = previous.extendedIndexes.find((item) => item.url === ref.url);
      //
      //   if (changedIndex) {
      //     const pos = current.data.extends?.findIndex((item) => item.url === ref.url);
      //     await this.extendIndex(previous, ref, pos);
      //   }
      // }
    }

    if (addedExtends.length) {
      for (const ref of addedExtends) {
        const pos = current.data.extends?.findIndex((item) => item.url === ref.url);
        await this.extendIndex(previous, ref, pos);
      }

      if (this.options?.watch) {
        this.watchAll();
      }
    }
  }

  private async mergeIncludes(previous: SpecIndex, current: SpecIndex) {
    const removedIncludes = getRemovedItem(previous.data.includes || [], current.data.includes || []);
    const addedIncludes = getAddedItem(previous.data.includes || [], current.data.includes || []);
    const changedIncludes = getChangedItem(previous.data.includes || [], current.data.includes || []);

    if (removedIncludes.length) {
      for (const ref of removedIncludes) {
        const removedIndex = previous.includedIndexes.find((item) => item.url === ref.url);
        const removedSpec = previous.spec.includedSpecs?.find((item) => item.id === ref.url);

        if (removedIndex) {
          previous.includedIndexes.splice(previous.includedIndexes.indexOf(removedIndex), 1);

          this.unwatch(removedIndex.file);
          delete this.indexes[removedIndex.file];

          const includedIndexPosition = this.specs.indexOf(removedIndex);
          if (includedIndexPosition && includedIndexPosition > -1) {
            this.specs.splice(includedIndexPosition, 1);
          }
        }

        if (removedSpec) {
          previous.spec.includedSpecs?.splice(previous.spec.includedSpecs?.indexOf(removedSpec), 1);
        }
      }
    }

    if (changedIncludes.length) {
      // for (const ref of changedIncludes) {
      //   const changedIndex = previous.includedIndexes.find((item) => item.url === ref.url);
      //
      //   if (changedIndex) {
      //     const pos = current.data.includes?.findIndex((item) => item.url === ref.url);
      //     await this.includeIndex(previous, ref, pos);
      //   }
      // }
    }

    if (addedIncludes.length) {
      for (const ref of addedIncludes) {
        const pos = current.data.includes?.findIndex((item) => item.url === ref.url);
        await this.includeIndex(previous, ref, pos);
      }

      if (this.options?.watch) {
        this.watchAll();
      }
    }
  }

  private async extendIndex(index: SpecIndex, { url, excludes }: ExternalRef, pos?: number) {
    const { spec } = index;

    const extendedIndex = await this.load(url, index, true, excludes);
    const { spec: extendedSpec } = extendedIndex;

    if (!spec.extendedSpecs) {
      spec.extendedSpecs = [];
    }

    if (spec.layer && !extendedSpec.layer) {
      extendedSpec.layer = spec.layer;
    }

    if (typeof pos === 'number' && pos > -1) {
      index.extendedIndexes.splice(pos, 0, extendedIndex);
      spec.extendedSpecs.splice(pos, 0, extendedSpec);
    } else {
      index.extendedIndexes.unshift(extendedIndex);
      spec.extendedSpecs.unshift(extendedSpec);
    }

    for (const [key, value] of Object.entries(extendedSpec)) {
      if (
        ALLOWED_OVERRIDE_KEYS.includes(key as keyof LoadedDesignSpec) &&
        typeof this.root.spec[key as keyof LoadedDesignSpec] === 'undefined'
      ) {
        this.root.spec[key as keyof LoadedDesignSpec] = value as never;
      }
    }
  }

  private async includeIndex(index: SpecIndex, { url, excludes }: ExternalRef, pos?: number) {
    const { spec } = index;

    const includedIndex = await this.load(url, index, true, excludes);
    const { spec: includedSpec } = includedIndex;

    if (!spec.includedSpecs) {
      spec.includedSpecs = [];
    }

    if (spec.layer && !includedSpec.layer) {
      includedSpec.layer = spec.layer;
    }

    if (typeof pos === 'number' && pos > -1) {
      index.includedIndexes.splice(pos, 0, includedIndex);
      spec.includedSpecs.splice(pos, 0, includedSpec);
    } else {
      index.includedIndexes.push(includedIndex);
      spec.includedSpecs.push(includedSpec);
    }

    for (const [key, value] of Object.entries(includedSpec)) {
      if (
        ALLOWED_OVERRIDE_KEYS.includes(key as keyof LoadedDesignSpec) &&
        typeof this.root.spec[key as keyof LoadedDesignSpec] === 'undefined'
      ) {
        this.root.spec[key as keyof LoadedDesignSpec] = value as never;
      }
    }
  }
}

function getAddedItem(previous: ExternalRef[], current: ExternalRef[]) {
  return current.filter((c) => !previous.find((n) => n.url === c.url));
}

function getRemovedItem(previous: ExternalRef[], current: ExternalRef[]) {
  return previous.filter((c) => !current.find((n) => n.url === c.url));
}

function getChangedItem(previous: ExternalRef[], current: ExternalRef[]) {
  return current.filter((c) => !previous.find((n) => JSON.stringify(n) === JSON.stringify(c)));
}

function mergeKeys(a: string[], b: string[]) {
  return [...new Set([...a, ...b])];
}
