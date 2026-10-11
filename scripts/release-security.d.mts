export interface ReleaseManifest {
  id: string; version: string; minAppVersion: string; name: string;
  author: string; description: string; isDesktopOnly: boolean;
}
export function validateManifest(value: unknown): asserts value is ReleaseManifest;
export function projectRoot(): Promise<string>;
export function safePath(root: string, path: string, kind?: 'any' | 'file' | 'directory', allowMissing?: boolean): Promise<string>;
export function hasProjectFile(root: string, path: string): Promise<boolean>;
export function readProjectFile(root: string, path: string): Promise<Buffer>;
export function listProjectFiles(root: string, directory: string): Promise<string[]>;
export function assertSafeTree(root: string, directory: string): Promise<void>;
export function assertHashKeys(value: unknown, expectedNames: Iterable<string>): void;
export function verifyZip(bytes: Uint8Array, expectedNames: Iterable<string>, limits?: { maxArchiveBytes?: number; maxUncompressedBytes?: number }): Record<string, Uint8Array>;
