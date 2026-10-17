// Local Whisper models (whisper.cpp ggml format, quantized), downloaded on demand
// from the official whisper.cpp repository on Hugging Face and checked by SHA-256.

export type LocalModelId = 'base' | 'small' | 'turbo';

export interface LocalModel {
  id: LocalModelId;
  file: string;
  sizeMb: number;
  sha256: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'base',
    file: 'ggml-base-q5_1.bin',
    sizeMb: 60,
    sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
  },
  {
    id: 'small',
    file: 'ggml-small-q5_1.bin',
    sizeMb: 190,
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
  },
  {
    id: 'turbo',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    sizeMb: 574,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
  },
];

export const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

export function localModel(id: LocalModelId): LocalModel {
  return LOCAL_MODELS.find((m) => m.id === id) ?? LOCAL_MODELS[1];
}

export function isLocalModelId(value: unknown): value is LocalModelId {
  return LOCAL_MODELS.some((m) => m.id === value);
}
