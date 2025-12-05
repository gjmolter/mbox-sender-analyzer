import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileSelect, isProcessing }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isProcessing) return;

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onFileSelect(e.dataTransfer.files[0]);
      }
    },
    [onFileSelect, isProcessing]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`glass-card border-2 border-dashed p-12 text-center transition-all cursor-pointer relative group
        ${isProcessing 
          ? 'border-white/10 cursor-not-allowed opacity-50' 
          : 'border-white/20 hover:border-orange/50 hover:bg-white/5'}`}
    >
      <input
        type="file"
        accept=".mbox"
        onChange={handleChange}
        className="hidden"
        id="file-upload"
        disabled={isProcessing}
      />
      <label htmlFor="file-upload" className="cursor-pointer block relative z-10">
        <div className="flex flex-col items-center justify-center gap-4">
          {isProcessing ? (
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-white/10 border-t-orange" />
          ) : (
            <div className="p-4 rounded-full bg-white/5 group-hover:bg-orange/10 transition-colors duration-300">
              <Upload className="w-12 h-12 text-lightgray group-hover:text-orange transition-colors duration-300" />
            </div>
          )}
          
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground group-hover:text-white transition-colors">
              {isProcessing ? 'Processing Mbox File...' : 'Drop your .mbox file here'}
            </p>
            {!isProcessing && (
              <p className="text-sm text-muted-foreground group-hover:text-lightgray">
                or click to select file
              </p>
            )}
          </div>
        </div>
      </label>
    </div>
  );
};

