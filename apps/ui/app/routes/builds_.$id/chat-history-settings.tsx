import React, { useCallback, useState } from 'react';
import {
  Settings,
  DollarSign,
  Download,
  File,
  Code,
  FolderTree,
  FileCode,
  Layers,
  SlidersHorizontal,
  ScanEye,
  Image,
  FlaskConical,
} from 'lucide-react';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { FloatingPanelMenuButton } from '#components/ui/floating-panel.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSwitchItem,
  DropdownMenuSliderItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '#components/ui/dropdown-menu.js';
import { menuItemLayoutClass } from '#components/ui/menu.variants.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useImageQuality } from '#hooks/use-image-quality.js';
import { cookieName } from '#constants/cookie.constants.js';
import { downloadBlob } from '#utils/file.utils.js';
import { serializeTranscript } from '#utils/chat.utils.js';
import { toSnakeCase } from '#utils/string.utils.js';

/**
 * Component that provides settings for the chat history panel
 */
export function ChatHistorySettings(): React.ReactNode {
  const messages = useChatSelector((state) => state.messages);
  const chatName = useChatSelector((state) => state.chatName);
  const [showModelCost, setShowModelCost] = useCookie(cookieName.chatModelCost, true);
  const [showCodePreview, setShowCodePreview] = useCookie(cookieName.chatToolCodePreview, true);
  const [showAnalysisImages, setShowAnalysisImages] = useCookie(cookieName.chatToolAnalysisImages, true);
  const [includeFilesystem, setIncludeFilesystem] = useCookie(cookieName.chatCtxFs, true);
  const [includeActiveFile, setIncludeActiveFile] = useCookie(cookieName.chatCtxActive, true);
  const [includeOpenFiles, setIncludeOpenFiles] = useCookie(cookieName.chatCtxOpen, true);
  const [testingEnabled, setTestingEnabled] = useCookie(cookieName.chatTestingEnabled, true);
  const { quality: screenshotQuality, setQuality: setScreenshotQuality } = useImageQuality();
  const [isOpen, setIsOpen] = useState(false);

  const handleShowModelCostToggle = useCallback(
    (checked: boolean) => {
      setShowModelCost(checked);
    },
    [setShowModelCost],
  );

  const handleShowCodePreviewToggle = useCallback(
    (checked: boolean) => {
      setShowCodePreview(checked);
    },
    [setShowCodePreview],
  );

  const handleShowAnalysisImagesToggle = useCallback(
    (checked: boolean) => {
      setShowAnalysisImages(checked);
    },
    [setShowAnalysisImages],
  );

  const handleIncludeFilesystemToggle = useCallback(
    (checked: boolean) => {
      setIncludeFilesystem(checked);
    },
    [setIncludeFilesystem],
  );

  const handleIncludeActiveFileToggle = useCallback(
    (checked: boolean) => {
      setIncludeActiveFile(checked);
    },
    [setIncludeActiveFile],
  );

  const handleIncludeOpenFilesToggle = useCallback(
    (checked: boolean) => {
      setIncludeOpenFiles(checked);
    },
    [setIncludeOpenFiles],
  );

  const handleTestingEnabledToggle = useCallback(
    (checked: boolean) => {
      setTestingEnabled(checked);
    },
    [setTestingEnabled],
  );

  const handleScreenshotQualityChange = useCallback(
    (value: number) => {
      setScreenshotQuality(value);
    },
    [setScreenshotQuality],
  );

  const formatQualityValue = useCallback((value: number): string => {
    return `${Math.round(value * 100)}%`;
  }, []);

  const handleExport = useCallback(() => {
    const transcript = serializeTranscript(messages, chatName);
    const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' });
    const timestamp = new Date().toISOString().slice(0, 16).replaceAll(':', '-');
    const snakeName = toSnakeCase(chatName) || 'chat_transcript';
    downloadBlob(blob, `${snakeName}_${timestamp}.md`);
  }, [messages, chatName]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <FloatingPanelMenuButton asChild tooltip="Chat settings" aria-label="Chat settings">
        <DropdownMenuTrigger>
          <Settings className="size-4" />
        </DropdownMenuTrigger>
      </FloatingPanelMenuButton>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="w-56"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuLabel>Metadata Display</DropdownMenuLabel>
        <DropdownMenuSwitchItem isChecked={showModelCost} onIsCheckedChange={handleShowModelCostToggle}>
          <DollarSign className="stroke-2" />
          Show Model Cost
        </DropdownMenuSwitchItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Context Settings</DropdownMenuLabel>

        {/* Context Settings Sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={menuItemLayoutClass}>
              <Layers />
              Editor Context
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuSwitchItem isChecked={includeFilesystem} onIsCheckedChange={handleIncludeFilesystemToggle}>
              <FolderTree />
              Filesystem
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem isChecked={includeActiveFile} onIsCheckedChange={handleIncludeActiveFileToggle}>
              <FileCode />
              Active File
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem isChecked={includeOpenFiles} onIsCheckedChange={handleIncludeOpenFilesToggle}>
              <File />
              Open Tabs
            </DropdownMenuSwitchItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Tool Display Settings</DropdownMenuLabel>

        {/* File Operations Sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={menuItemLayoutClass}>
              <File />
              File Operations
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuSwitchItem isChecked={showCodePreview} onIsCheckedChange={handleShowCodePreviewToggle}>
              <Code />
              Preview
            </DropdownMenuSwitchItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Analysis Sub-menu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={menuItemLayoutClass}>
              <ScanEye />
              Analysis
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuLabel>Image Analysis</DropdownMenuLabel>
            <DropdownMenuSwitchItem isChecked={showAnalysisImages} onIsCheckedChange={handleShowAnalysisImagesToggle}>
              <Image />
              Preview
            </DropdownMenuSwitchItem>
            <DropdownMenuSliderItem
              value={screenshotQuality}
              min={0.1}
              max={1}
              step={0.1}
              formatValue={formatQualityValue}
              infoTooltip={
                <InfoTooltip>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>Lower quality: less precise, faster upload and lower LLM cost</li>
                    <li>Higher quality: more precise, slower upload and higher LLM cost</li>
                  </ul>
                </InfoTooltip>
              }
              onValueChange={handleScreenshotQualityChange}
            >
              <SlidersHorizontal />
              Quality
            </DropdownMenuSliderItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Testing toggle */}
        <DropdownMenuSwitchItem isChecked={testingEnabled} onIsCheckedChange={handleTestingEnabledToggle}>
          <FlaskConical />
          Testing
        </DropdownMenuSwitchItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem disabled={messages.length === 0} onSelect={handleExport}>
          <Download />
          Export Transcript
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
