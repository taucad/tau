# Dual CAD Kernel Support Implementation

This document outlines the implementation of dual CAD kernel support in the API and UI, enabling users to work with both Replicad and OpenSCAD in AI chat conversations.

## Overview

The system now supports two CAD kernels:
- **Replicad**: TypeScript-based 3D modeling with OpenCascade integration
- **OpenSCAD**: Functional 3D modeling language using Constructive Solid Geometry (CSG)

## Implementation Details

### 1. Type System Updates

#### `apps/ui/app/types/chat.types.ts`
- Added `kernel?: KernelProvider` to message metadata interface
- Enables kernel selection to be passed through chat messages

#### `apps/ui/app/types/kernel.types.ts`
- Already contained `kernelProviders = ['replicad', 'openscad']` type definitions
- Provides consistent typing across the system

### 2. UI Components

#### `apps/ui/app/components/chat/chat-textarea.tsx`
- Added kernel selector ComboBox next to model selector
- Kernel selection is passed through `onSubmit` metadata
- UI shows descriptive names: "Replicad" and "OpenSCAD"
- Current kernel is managed as component state with proper syncing

#### `apps/ui/app/routes/builds_.$id/chat-interface.tsx`
- Updated to accept `currentKernel` prop
- Passes kernel information down to ChatHistory component

#### `apps/ui/app/routes/builds_.$id/chat-history.tsx`
- Updated to accept and forward `currentKernel` prop to ChatTextarea
- Maintains kernel context throughout the chat interface

#### `apps/ui/app/routes/builds_.$id/route.tsx`
- Passes build's mechanical language as `currentKernel` to ChatInterface
- Ensures kernel selection reflects the build's actual CAD kernel

### 3. Chat Provider Integration

#### `apps/ui/app/components/chat/ai-chat-provider.tsx`
- Enhanced `experimental_prepareRequestBody` to include:
  - Selected kernel from message metadata or build context
  - Multi-file context with proper file extensions
  - Comprehensive files structure for API consumption
- Integrates with build context to provide accurate file information

### 4. API Updates

#### `apps/api/app/api/chat/chat.controller.ts`
- Added `kernel` and `files` fields to `CreateChatBody` type
- Enhanced request processing to extract kernel from message metadata
- Added files context to system prompt using XML formatting
- Passes selected kernel to chat service

#### `apps/api/app/api/chat/chat.service.ts`
- Updated `createGraph` method to accept `selectedKernel` parameter
- Passes kernel to CAD system prompt generation
- Updated supervisor prompt to reference selected kernel

### 5. Prompt System

#### `apps/api/app/api/chat/prompts/chat-prompt-cad.ts`
- Completely refactored to support kernel-specific prompts
- Added `openScadSpecificContent` with OpenSCAD-specific guidance
- Added `replicadSpecificContent` with Replicad-specific guidance
- Updated `getCadSystemPrompt` to accept kernel parameter
- Dynamic content generation based on selected kernel:
  - Language-specific syntax examples
  - Kernel-appropriate modeling strategies
  - Correct file extensions and naming conventions
  - Error handling specific to each kernel

### 6. Tool Updates

#### `apps/api/app/api/tools/tools/tool-file-edit.ts`
- Enhanced description with kernel-aware file naming guidelines
- Added support for appropriate file extensions (.ts for Replicad, .scad for OpenSCAD)
- Documented multi-file support capabilities
- Improved tool guidance for different CAD kernels

### 7. Build Creation

#### `apps/ui/app/routes/_index/route.tsx`
- Updated build creation to use selected kernel from chat metadata
- Dynamic file naming based on kernel selection
- Proper mechanical asset setup with correct language and main file

## Usage

### For Users

1. **Kernel Selection**: Users can now select between Replicad and OpenSCAD using the kernel selector in the chat interface
2. **Automatic Context**: The system automatically provides the appropriate prompts and guidance based on the selected kernel
3. **File Management**: Files are created with correct extensions and the LLM understands the file context
4. **Build Inheritance**: When opening an existing build, the kernel selector reflects the build's configured kernel

### For Developers

1. **Kernel Detection**: The system automatically detects the appropriate kernel from:
   - User message metadata
   - Build mechanical asset language
   - Defaults to 'replicad' if not specified

2. **File Context**: The API receives comprehensive file information including:
   - Current main file
   - All project files with content and language
   - Proper file extensions for each kernel

3. **Extensible Design**: The implementation is designed to easily support additional CAD kernels in the future

## Multi-File Support Foundation

The implementation includes foundational support for multi-file CAD projects:

- **File Context Tracking**: The system tracks all files in a project and their relationships
- **Main File Concept**: Maintains the concept of a main entry file while supporting additional files
- **Language Association**: Each file is associated with the appropriate kernel language
- **Tool Awareness**: The file edit tool understands multi-file projects and can suggest appropriate file splits

## Error Handling

The system provides kernel-specific error handling and guidance:

- **Replicad**: JavaScript/TypeScript compilation errors, OpenCascade kernel errors, geometric failures
- **OpenSCAD**: Syntax errors, undefined variables, CSG operation failures, module errors

## Future Enhancements

The implementation provides a foundation for:

1. **Additional Kernels**: Easy addition of new CAD kernels (e.g., FreeCAD, SolidPython)
2. **Advanced Multi-file Support**: Full project management with imports/includes
3. **Kernel Migration**: Potential for converting between different kernel formats
4. **Hybrid Projects**: Supporting multiple kernels within a single project

## Testing

To test the implementation:

1. Create a new build and select different kernels in the chat interface
2. Verify that appropriate file extensions are used
3. Test that the LLM generates kernel-appropriate code
4. Confirm that existing builds maintain their kernel selection
5. Validate that error messages are kernel-specific

## Migration Notes

- Existing builds continue to work unchanged (default to Replicad)
- No database migrations required
- Backward compatibility maintained
- UI gracefully handles builds without explicit kernel specification

## Summary

This implementation provides a robust foundation for dual CAD kernel support while maintaining backward compatibility and providing an extensible architecture for future enhancements. The system now intelligently adapts its behavior, prompts, and file handling based on the selected CAD kernel, providing users with appropriate guidance and tooling for their chosen modeling approach.