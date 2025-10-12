import { Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.js';

type DropAreaProperties = {
  readonly onFileSelect: (file: File) => void;
  readonly className?: string;
};

export function DropArea({ onFileSelect, className }: DropAreaProperties): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file) {
          onFileSelect(file);
        }
      }
    },
    [onFileSelect],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0];
        if (file) {
          onFileSelect(file);
        }

        // Clear the input so the same file can be selected again
        event.target.value = '';
      }
    },
    [onFileSelect],
  );

  const handleButtonClick = useCallback(() => {
    fileInputReference.current?.click();
  }, []);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-6 rounded-lg border-2 border-dashed p-12 transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-background',
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Upload className="size-8 text-primary" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h3 className="text-lg font-medium">Drop your 3D model here</h3>
        <p className="text-sm text-muted-foreground">or click the button below to browse</p>
      </div>

      <Button onClick={handleButtonClick} size="lg">
        Select 3D Model
      </Button>

      <input
        ref={fileInputReference}
        type="file"
        className="hidden"
        accept=".3dm,.3ds,.3mf,.ac,.ase,.amf,.brep,.bvh,.cob,.dae,.drc,.dxf,.fbx,.glb,.gltf,.ifc,.iges,.igs,.lwo,.md2,.md5mesh,.mesh.xml,.nff,.obj,.off,.ogex,.ply,.smd,.step,.stl,.stp,.usda,.usdc,.usdz,.wrl,.x,.x3d,.x3db,.x3dv,.xgl"
        onChange={handleFileInputChange}
      />

      <div className="max-w-md text-center">
        <p className="text-xs text-muted-foreground">
          Supports: STL, STEP, IGES, FBX, OBJ, GLTF, GLB, and many more 3D formats
        </p>
      </div>
    </div>
  );
}

