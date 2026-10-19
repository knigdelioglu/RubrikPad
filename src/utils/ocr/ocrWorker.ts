import type { Student } from '../../types.ts';
import type {
  ColumnRole,
  PreprocessingOptions,
  RawGrayImage,
} from './ocrTypes.ts';
import {
  runLocalRosterOcrPipeline,
  type FullRosterOcrPipelineResult,
} from './rosterOcrPipeline.ts';

export interface OcrWorkerRequestMessage {
  requestId: string;
  image: {
    width: number;
    height: number;
    data: Uint8Array;
  };
  existingClassroomStudents: Student[];
  options?: {
    preprocessing?: PreprocessingOptions;
    manualColumnRoles?: Record<number, ColumnRole>;
    forceHeaderlessMode?: boolean;
  };
}

export interface OcrWorkerResponseMessage {
  requestId: string;
  ok: boolean;
  result?: FullRosterOcrPipelineResult;
  error?: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<OcrWorkerRequestMessage>) => void) | null;
  postMessage: (
    message: OcrWorkerResponseMessage,
    transfer?: Transferable[]
  ) => void;
};

workerScope.onmessage = async (event: MessageEvent<OcrWorkerRequestMessage>) => {
  const { requestId, image, existingClassroomStudents, options } = event.data;
  try {
    const grayImage: RawGrayImage = {
      width: image.width,
      height: image.height,
      data:
        image.data instanceof Uint8Array
          ? image.data
          : new Uint8Array(image.data),
    };

    const result = await runLocalRosterOcrPipeline(
      grayImage,
      existingClassroomStudents || [],
      options || {}
    );

    result.performanceMetrics.executedInWebWorker = true;

    workerScope.postMessage({
      requestId,
      ok: true,
      result,
    });
  } catch (err) {
    workerScope.postMessage({
      requestId,
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Web Worker OCR işlemi sırasında bir hata oluştu.',
    });
  }
};
