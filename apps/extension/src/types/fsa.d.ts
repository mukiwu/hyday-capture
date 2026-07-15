// File System Access API 的權限方法與 showDirectoryPicker 在目前的 lib.dom 尚未涵蓋，
// 這裡以介面合併補上實際用到的部分。

type FileSystemPermissionMode = 'read' | 'readwrite'

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: FileSystemPermissionMode
  startIn?: FileSystemHandle | string
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}
