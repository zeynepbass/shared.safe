import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { newId } from '@/shared/db/ids';

// Picks an image from the camera or library and copies it into the app's documents folder, so
// it survives the picker's cache being cleared. Returns { status: 'ok' | 'denied' | 'canceled' }.
export async function pickImage(source, { folder, ...options }) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const pickerOptions = { mediaTypes: ['images'], ...options };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };

  const directory = new Directory(Paths.document, folder);
  directory.create({ idempotent: true, intermediates: true });
  const picked = new File(result.assets[0].uri);
  const extension = picked.extension || '.jpg';
  const destination = new File(directory, `${newId()}${extension}`);
  await picked.copy(destination);
  return { status: 'ok', uri: destination.uri };
}

export function deleteImage(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Image could not be deleted', error);
  }
}

export function deleteImageFolder(folder) {
  try {
    const directory = new Directory(Paths.document, folder);
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn('Image folder could not be deleted', error);
  }
}
