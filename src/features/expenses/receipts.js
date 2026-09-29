import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { newId } from '@/db/ids';

const PICKER_OPTIONS = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false };

export async function pickReceipt(source) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };

  const directory = new Directory(Paths.document, 'receipts');
  directory.create({ idempotent: true, intermediates: true });
  const picked = new File(result.assets[0].uri);
  const extension = picked.extension || '.jpg';
  const destination = new File(directory, `${newId()}${extension}`);
  await picked.copy(destination);
  return { status: 'ok', uri: destination.uri };
}

export function deleteReceipt(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Receipt could not be deleted', error);
  }
}
