import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { cx, focusRingClasses } from '../ui/classNames';

interface FileDropzoneProps {
  /** Accepted extensions, as in the input's `accept` attribute: `.json,.zip`. */
  accept: string;
  onFile: (file: File) => void;
  /** Called instead of `onFile` for a file whose extension is not accepted. */
  onReject?: (file: File) => void;
  label: string;
  fileName?: string;
}

function acceptedExtensions(accept: string): string[] {
  return accept.split(',').map((extension) => extension.trim().toLowerCase()).filter(Boolean);
}

/**
 * The picker's `accept` filter can be bypassed ("All files", drag and drop):
 * the same rule is applied to every file received.
 */
function isAccepted(file: File, accept: string): boolean {
  const name = file.name.toLowerCase();
  return acceptedExtensions(accept).some((extension) => name.endsWith(extension));
}

/** File picker that also takes a dropped file. A real button: it opens from the keyboard. */
export default function FileDropzone({ accept, onFile, onReject, label, fileName }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const receive = (file: File | undefined) => {
    if (!file) return;
    if (isAccepted(file, accept)) onFile(file);
    else onReject?.(file);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    receive(event.dataTransfer.files[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    receive(event.target.files?.[0]);
    // Picking the same file again after an error must fire `change` again
    event.target.value = '';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        className={cx(
          'w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors',
          isDragOver ? 'border-accent' : 'border-gray-600 hover:border-accent/50',
          focusRingClasses,
        )}
      >
        <span className="block text-fg-muted text-sm">{label}</span>
        {fileName && <span className="block text-accent text-sm mt-3 font-mono">{fileName}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
      />
    </>
  );
}
