import childProcess, { type ExecFileOptions } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { StashError } from "../types.js";

// IFileOperation requests recycling explicitly; the sink rejects a permanent
// deletion before it begins. Paths enter through the environment, never code.
// https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags
const WINDOWS_RECYCLE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IStashFileOperation {
  void Advise(IntPtr sink, out uint cookie);
  void Unadvise(uint cookie);
  void SetOperationFlags(uint flags);
  void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
  void SetProgressDialog(IntPtr dialog);
  void SetProperties(IntPtr properties);
  void SetOwnerWindow(uint owner);
  void ApplyPropertiesToItem(IntPtr item);
  void ApplyPropertiesToItems(IntPtr items);
  void RenameItem(IntPtr item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
  void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
  void MoveItem(IntPtr item, IntPtr destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
  void MoveItems(IntPtr items, IntPtr destination);
  void CopyItem(IntPtr item, IntPtr destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
  void CopyItems(IntPtr items, IntPtr destination);
  void DeleteItem(IntPtr item, IStashProgressSink sink);
  void DeleteItems(IntPtr items);
  void NewItem(IntPtr destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name,
    [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
  void PerformOperations();
  void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
}

[ComVisible(true), Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IStashProgressSink {
  [PreserveSig] int StartOperations();
  [PreserveSig] int FinishOperations(int result);
  [PreserveSig] int PreRenameItem(uint flags, IntPtr item, IntPtr name);
  [PreserveSig] int PostRenameItem(uint flags, IntPtr item, IntPtr name, int result, IntPtr created);
  [PreserveSig] int PreMoveItem(uint flags, IntPtr item, IntPtr destination, IntPtr name);
  [PreserveSig] int PostMoveItem(uint flags, IntPtr item, IntPtr destination, IntPtr name, int result, IntPtr created);
  [PreserveSig] int PreCopyItem(uint flags, IntPtr item, IntPtr destination, IntPtr name);
  [PreserveSig] int PostCopyItem(uint flags, IntPtr item, IntPtr destination, IntPtr name, int result, IntPtr created);
  [PreserveSig] int PreDeleteItem(uint flags, IntPtr item);
  [PreserveSig] int PostDeleteItem(uint flags, IntPtr item, int result, IntPtr created);
  [PreserveSig] int PreNewItem(uint flags, IntPtr destination, IntPtr name);
  [PreserveSig] int PostNewItem(uint flags, IntPtr destination, IntPtr name, IntPtr template, uint attributes, int result, IntPtr created);
  [PreserveSig] int UpdateProgress(uint total, uint complete);
  [PreserveSig] int ResetTimer();
  [PreserveSig] int PauseTimer();
  [PreserveSig] int ResumeTimer();
}

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class StashProgressSink : IStashProgressSink {
  public int Result = 0;
  public bool Recycled = false;
  public int StartOperations() => 0;
  public int FinishOperations(int result) { if (result < 0) Result = result; return 0; }
  public int PreRenameItem(uint f, IntPtr i, IntPtr n) => 0;
  public int PostRenameItem(uint f, IntPtr i, IntPtr n, int r, IntPtr c) => 0;
  public int PreMoveItem(uint f, IntPtr i, IntPtr d, IntPtr n) => 0;
  public int PostMoveItem(uint f, IntPtr i, IntPtr d, IntPtr n, int r, IntPtr c) => 0;
  public int PreCopyItem(uint f, IntPtr i, IntPtr d, IntPtr n) => 0;
  public int PostCopyItem(uint f, IntPtr i, IntPtr d, IntPtr n, int r, IntPtr c) => 0;
  public int PreDeleteItem(uint flags, IntPtr item) {
    return (flags & 0x80) != 0 ? 0 : unchecked((int)0x80004004);
  }
  public int PostDeleteItem(uint flags, IntPtr item, int result, IntPtr created) {
    Result = result;
    Recycled = result >= 0 && (flags & 0x80) != 0 && created != IntPtr.Zero;
    return 0;
  }
  public int PreNewItem(uint f, IntPtr d, IntPtr n) => 0;
  public int PostNewItem(uint f, IntPtr d, IntPtr n, IntPtr t, uint a, int r, IntPtr c) => 0;
  public int UpdateProgress(uint total, uint complete) => 0;
  public int ResetTimer() => 0;
  public int PauseTimer() => 0;
  public int ResumeTimer() => 0;
}

public static class StashRecycle {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IntPtr item);
  public static void Send(string path) {
    var iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
    IntPtr item = IntPtr.Zero;
    var operation = (IStashFileOperation)Activator.CreateInstance(
      Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
    try {
      SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
      var sink = new StashProgressSink();
      // RECYCLEONDELETE | EARLYFAILURE | NOERRORUI | SILENT | NOCONFIRMATION.
      operation.SetOperationFlags(0x00080000 | 0x00100000 | 0x400 | 0x4 | 0x10);
      operation.DeleteItem(item, sink);
      operation.PerformOperations();
      bool aborted;
      operation.GetAnyOperationsAborted(out aborted);
      Marshal.ThrowExceptionForHR(sink.Result);
      if (aborted || !sink.Recycled) throw new InvalidOperationException("Recycling was not completed.");
    } finally {
      if (item != IntPtr.Zero) Marshal.Release(item);
      Marshal.FinalReleaseComObject(operation);
    }
  }
}
'@
[StashRecycle]::Send($env:STASH_RECYCLE_TARGET)
`;

const MAC_RECYCLE = `
ObjC.import('Foundation');
function run(argv) {
  var error = Ref();
  var url = $.NSURL.fileURLWithPath(argv[0]);
  if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError(url, null, error))
    throw new Error(ObjC.unwrap(error[0].localizedDescription));
}
`;

/** Move an already-authorized path to the OS trash. Missing paths are idempotent. */
export async function recyclePath(target: string): Promise<void> {
  if (!path.isAbsolute(target) || path.resolve(target) === path.parse(path.resolve(target)).root) {
    throw new StashError("unsafe-recycle-path", `Refusing to recycle root or relative path "${target}".`, 3);
  }
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  try {
    const exec = (file: string, args: string[], options: ExecFileOptions) =>
      new Promise<void>((resolve, reject) => {
        childProcess.execFile(file, args, options, (error, _stdout, stderr) => {
          if (!error) return resolve();
          const detail = String(stderr || error.message.split(/\r?\n/, 1)[0]).trim();
          reject(new Error(`${file}: ${detail.slice(0, 1000)}`));
        });
      });
    const options = { windowsHide: true, timeout: 60_000, maxBuffer: 256 * 1024 };
    if (process.platform === "win32") {
      await exec("pwsh.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", WINDOWS_RECYCLE], {
        ...options, env: { ...process.env, STASH_RECYCLE_TARGET: target },
      });
    } else if (process.platform === "darwin") {
      await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", MAC_RECYCLE, target], options);
    } else if (process.platform === "linux") {
      await exec("gio", ["trash", "--", target], options);
    } else {
      throw new Error(`No OS trash adapter for ${process.platform}.`);
    }
    try {
      await lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw new Error("The path remains after the trash operation.");
  } catch (error) {
    throw new StashError("recycle-failed", `Unable to recycle "${target}"; no permanent-delete fallback: ${String(error)}`, 4);
  }
}
