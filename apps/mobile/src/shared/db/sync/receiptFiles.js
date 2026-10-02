// Where receipt photos live on the device: plain files in the app's documents folder (the
// device's own storage encryption protects them at rest). Kept behind this small interface so
// the sync code can be tested without a file system:
//
//   read(path) → Uint8Array | null (the file is gone)      write(id, bytes) → path
//
// The folder is the one the receipt picker and scanner save into.
export const RECEIPT_FOLDER = 'receipts';

const deviceFiles = {
  read(path) {
    // Required here rather than at the top: the native file system is not there in tests.
    const { File } = require('expo-file-system');
    const file = new File(path);
    return file.exists ? file.bytesSync() : null;
  },
  write(id, bytes) {
    const { Directory, File, Paths } = require('expo-file-system');
    const folder = new Directory(Paths.document, RECEIPT_FOLDER);
    folder.create({ idempotent: true, intermediates: true });
    const file = new File(folder, `${id}.jpg`);
    if (!file.exists) file.create();
    file.write(bytes);
    return file.uri;
  },
};

export function createMemoryReceiptFiles() {
  const files = new Map();
  return {
    read: (path) => files.get(path) ?? null,
    write(id, bytes) {
      const path = `memory://${RECEIPT_FOLDER}/${id}.jpg`;
      files.set(path, bytes);
      return path;
    },
    files,
  };
}

// Tests give every database (every simulated phone) files of its own.
const attached = new WeakMap();

export function attachReceiptFiles(db, files) {
  attached.set(db, files);
}

export function receiptFilesOf(db) {
  return attached.get(db) ?? deviceFiles;
}
