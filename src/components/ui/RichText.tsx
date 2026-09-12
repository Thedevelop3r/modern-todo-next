"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayHtml, FONT_FAMILIES, FONT_SIZES, TEXT_COLORS } from "@/lib/richtext";
import { Tooltip } from "./Menu";

/**
 * Rich text input.
 *
 * Two profiles: `full` for descriptions, and `inline` for titles - a title
 * renders inside one-line cells in the table view, the command palette and
 * search results, so it gets marks but no block formatting.
 *
 * What comes out of here is *not* trusted. The server sanitizes on write, and
 * only that sanitized value is ever rendered back.
 */
export type RichTextProfile = "full" | "inline";

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        // A toolbar button must never steal focus from the text, or the
        // selection it is about to act on would be lost.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-40",
          active ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;

function Toolbar({ editor, profile }: { editor: Editor; profile: RichTextProfile }) {
  // Toolbar state has to re-render on every selection change, which tiptap
  // reports through the editor rather than through React.
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const update = () => force();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link address", previous || "https://");
    if (href === null) return;
    if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-border bg-surface-sunken px-1.5 py-1"
    >
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Colour and size are <select>s rather than buttons: both are lists of
          fixed values, and the sanitizer only accepts values from these sets. */}
      <label className="sr-only" htmlFor="rt-color">
        Text colour
      </label>
      <select
        id="rt-color"
        aria-label="Text colour"
        value={(editor.getAttributes("textStyle").color as string) || ""}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value;
          if (value) editor.chain().focus().setColor(value).run();
          else editor.chain().focus().unsetColor().run();
        }}
        className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
      >
        {TEXT_COLORS.map((color) => (
          <option key={color.label} value={color.value}>
            {color.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Font size"
        value={(editor.getAttributes("textStyle").fontSize as string) || ""}
        onChange={(event) => {
          const value = event.target.value;
          if (value) editor.chain().focus().setFontSize(value).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
        className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
      >
        <option value="">Size</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size.replace("px", "")}
          </option>
        ))}
      </select>

      <select
        aria-label="Font"
        value={(editor.getAttributes("textStyle").fontFamily as string) || ""}
        onChange={(event) => {
          const value = event.target.value;
          if (value) editor.chain().focus().setFontFamily(value).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="h-7 max-w-[7.5rem] rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.label} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>

      <ToolbarButton
        label="Highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="h-3.5 w-3.5" />
      </ToolbarButton>

      {profile === "full" && (
        <>
          <Divider />
          <ToolbarButton
            label="Heading"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Subheading"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Bulleted list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align centre"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Justify"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton label="Add link" active={editor.isActive("link")} onClick={setLink}>
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Remove link"
            disabled={!editor.isActive("link")}
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <Link2Off className="h-3.5 w-3.5" />
          </ToolbarButton>
        </>
      )}

      <Divider />

      <ToolbarButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  profile = "full",
  placeholder,
  rows = 8,
  invalid,
  id,
  maxLength,
}: {
  /** Sanitized HTML from the server, or "" for a new record. */
  value: string;
  onChange: (html: string) => void;
  profile?: RichTextProfile;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  id?: string;
  maxLength?: number;
}) {
  const inline = profile === "inline";

  const editor = useEditor({
    // Rendering the first pass on the server produces markup React then
    // disagrees with, so the editor mounts on the client only.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // A title is one line: no blocks, and Enter must not create a paragraph.
        heading: inline ? false : { levels: [2, 3] },
        bulletList: inline ? false : undefined,
        orderedList: inline ? false : undefined,
        blockquote: inline ? false : undefined,
        codeBlock: inline ? false : undefined,
        horizontalRule: inline ? false : undefined,
        link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
      }),
      // TextStyle is the carrier mark; colour, size and family all ride on it,
      // and each maps to one of the style properties the sanitizer allows.
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      Highlight,
      ...(inline ? [] : [TextAlign.configure({ types: ["heading", "paragraph"] })]),
      Placeholder.configure({ placeholder: placeholder || "" }),
      ...(maxLength ? [CharacterCount.configure({ limit: maxLength })] : []),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        id: id || "",
        role: "textbox",
        "aria-multiline": String(!inline),
        class: cn(
          "prose-editor w-full rounded-b-lg border bg-surface px-3 py-2 text-sm text-fg outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          invalid ? "border-danger" : "border-border",
          inline ? "min-h-[2.5rem]" : "overflow-y-auto"
        ),
        style: inline ? "" : `min-height:${rows * 1.5}rem`,
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      // tiptap says "<p></p>" for an empty document; the API wants "".
      onChange(current.isEmpty ? "" : html);
    },
  });

  // Seed the editor when the record it is editing arrives, without stamping on
  // what the user is currently typing.
  React.useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming !== (editor.isEmpty ? "" : editor.getHTML())) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // Only when the record changes underneath us - not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-surface-sunken",
          inline ? "h-[4.6rem]" : "h-40"
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <div>
      <Toolbar editor={editor} profile={profile} />
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Renders stored rich text.
 *
 * The HTML passed here must be a value the **server** sanitized - that is the
 * entire safety argument for this component. `displayHtml` falls back to the
 * plaintext mirror for records written before rich text existed, or by the
 * import and quick-add paths.
 */
export function RichTextView({
  html,
  text,
  className,
}: {
  html?: string | null;
  text?: string | null;
  className?: string;
}) {
  const markup = displayHtml(html, text);
  if (!markup) return null;

  return (
    <div
      className={cn("prose-content text-sm leading-relaxed text-fg-muted", className)}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
