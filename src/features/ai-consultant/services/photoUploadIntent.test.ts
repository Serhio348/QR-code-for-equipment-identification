import { describe, expect, it } from 'vitest';
import { photoUploadKey, planFolderUpload, uploadNewPhotos } from './photoUploadIntent';

describe('planFolderUpload', () => {
  it('does not upload when the text only talks about uploading', () => {
    expect(planFolderUpload({
      uploadConfirmed: false,
      folderUrl: 'https://drive.google.com/drive/folders/abc',
      photoCount: 1,
    })).toEqual({ action: 'analyze' });
  });

  it('asks for a folder before writing', () => {
    expect(planFolderUpload({
      uploadConfirmed: true,
      folderUrl: '  ',
      photoCount: 2,
    })).toEqual({ action: 'need-folder' });
  });

  it('uploads only after the user confirms the folder', () => {
    expect(planFolderUpload({
      uploadConfirmed: true,
      folderUrl: 'https://drive.google.com/drive/folders/abc',
      photoCount: 1,
    })).toEqual({
      action: 'upload',
      folderUrl: 'https://drive.google.com/drive/folders/abc',
    });
  });
});

describe('uploadNewPhotos', () => {
  it('keeps a successful file and does not upload it again', async () => {
    const photos = [
      { fileName: 'a.jpg', size: 10 },
      { fileName: 'b.jpg', size: 20 },
    ];
    const calls: string[] = [];
    const first = await uploadNewPhotos(photos, new Set(), async (photo) => {
      calls.push(photo.fileName);
      if (photo.fileName === 'b.jpg') throw new Error('сбой');
      return 'https://files/a.jpg';
    });
    expect(first.uploaded.map(item => item.photo.fileName)).toEqual(['a.jpg']);
    expect(first.failed.map(photo => photo.fileName)).toEqual(['b.jpg']);

    const done = new Set(first.uploaded.map(item => photoUploadKey(item.photo)));
    const second = await uploadNewPhotos(photos, done, async (photo) => {
      calls.push(photo.fileName);
      return 'https://files/b.jpg';
    });
    expect(calls).toEqual(['a.jpg', 'b.jpg', 'b.jpg']);
    expect(second.uploaded.map(item => item.url)).toEqual(['https://files/b.jpg']);
    expect(second.failed).toEqual([]);
  });
});
