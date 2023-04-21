import { workerData, parentPort, Worker, isMainThread } from 'worker_threads';
import { path, globby } from 'zx';
import { fileURLToPath } from 'url';
import { type NamingStyle, transformNamingStyle } from './utils';
import { walkFile, type Visitor, NamedImports, WrapperContainer } from './ast-helper';

interface GlobFiles {
  exec: 'glob-files';
  pattern: string;
  ignore: string[];
  cwd: string;
}

interface ScanComponent {
  exec: 'scan-component';
  cwd: string;
  files: string[];
  libraryNames?: string[];
  namingStyle?: NamingStyle;
}

export interface ComponentDetail {
  filename: string;
  components: string[]
}

type WorkerData = GlobFiles | ScanComponent;

type ExecType = WorkerData['exec'];

type WorkerEvent<T extends Record<string, any>> = { [K in keyof T]: { type: K; value: T[K] }}[keyof T];

interface ProgressCallback {
  (name: string, index: number, total: number): void
}

interface WorkerOptionsMap {
  'scan-component': Partial<Visitor> & {
    onProgress?: ProgressCallback;
  }
}

type WorkerOptions<T extends ExecType> =
  T extends keyof WorkerOptionsMap
    ? WorkerOptionsMap[T]
    : never;

interface WorkerOutput {
  'glob-files': string[];
  'scan-component': ComponentDetail[];
}

if (!isMainThread) {
  const data: WorkerData = workerData;
  if (data.exec === 'glob-files') {
    postMessage<WorkerEvent<{ finish: string[] }>>({
      type: 'finish',
      value: globby.globbySync(data.pattern, {
        absolute: true,
        cwd: data.cwd,
        ignore: data.ignore,
      }),
    });
  } else if (data.exec === 'scan-component') {
    const { files, cwd, libraryNames, namingStyle = 'default' } = data;
    const details: ComponentDetail[] = [];

    type EventParams = WorkerEvent<{
      finish: WorkerOutput['scan-component'];
      onProgress: Parameters<ProgressCallback>;
      onTag: Parameters<Visitor['onTag']>;
      onImport: Parameters<Visitor['onImport']>;
    }>;

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const relFileName = path.relative(cwd, filename);

      postMessage<EventParams>({
        type: 'onProgress',
        value: [relFileName, i, files.length],
      });

      const detail: ComponentDetail = { filename: relFileName, components: [] };

      walkFile(filename, {
        onTag: name => {
          if (name === WrapperContainer) return;
          name = transformNamingStyle(name, namingStyle);
          postMessage<EventParams>({ type: 'onTag', value: [name] });
          detail.components.push(name);
        },
        onImport: info => {
          if (info.default) {
            info.default = transformNamingStyle(info.default, namingStyle);
          }
          if (info.named) {
            info.named = info.named.map(v => Object.fromEntries(
              Object.entries(v).map(([key, value]) => [
                key,
                transformNamingStyle(value, namingStyle),
              ]),
            )) as NamedImports;
          }

          postMessage<EventParams>({ type: 'onImport', value: [info] });

          if (libraryNames?.some(key => info.path.startsWith(key))) {
            info.named?.forEach(v => {
              // collect unaliased names as component
              detail.components.push(v.id);
            });
          }
        },
      });

      details.push(detail);
    }

    postMessage<EventParams>({
      type: 'finish',
      value: details,
    });
  } else {
    throw new Error('Type error with `exec`');
  }
}

/**
 * Wrapped postMessage function, provide type hints
 */
function postMessage<T>(data: T) {
  parentPort?.postMessage(data);
}

export function callWorker<
  T extends WorkerData,
  E extends T['exec'] = T['exec'],
>(workerData: T, options?: WorkerOptions<E>) {
  return new Promise<WorkerOutput[E]>((resolve, reject) => {
    const worker = new Worker(
      fileURLToPath(import.meta.url),
      { workerData },
    );
    worker.on('error', reject);
    worker.on('exit', code => code > 0 && reject(new Error(`Failed with exitCode ${code}`)));
    worker.on('message', data => {
      if (data.type === 'finish') {
        resolve(data.value);
        worker.terminate();
      } else {
        options?.[data.type]?.(...data.value);
      }
    });
  });
}
