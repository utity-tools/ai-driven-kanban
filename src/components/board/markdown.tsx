import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/*
 * Safe by construction:
 * - no rehype-raw, so raw HTML in the source is shown as text, never parsed;
 * - react-markdown's default urlTransform drops javascript:/data: and other
 *   unsafe URL schemes;
 * - links open in a new tab without access to this window (noopener) or the
 *   referrer (noreferrer);
 * - images are not rendered (no third-party requests / tracking pixels):
 *   they become a link to the image instead.
 * Headings are shifted down (h1 → h4 …) to fit under the modal's h2 title and
 * the h3 "Description" section heading.
 */
/** react-markdown passes its AST `node`; it must not reach the DOM. */
function omitNode<T extends { node?: unknown }>({ node, ...rest }: T): Omit<T, "node"> {
  void node;
  return rest;
}

const components: Components = {
  a: ({ href, children, ...props }) => (
    <a {...omitNode(props)} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ),
  img: ({ src, alt }) =>
    typeof src === "string" && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt || "Image"}
        <span className="sr-only"> (image, opens in a new tab)</span>
      </a>
    ) : (
      <>{alt}</>
    ),
  h1: (props) => <h4 {...omitNode(props)} />,
  h2: (props) => <h5 {...omitNode(props)} />,
  h3: (props) => <h6 {...omitNode(props)} />,
  h4: (props) => <h6 {...omitNode(props)} />,
  h5: (props) => <h6 {...omitNode(props)} />,
  h6: (props) => <h6 {...omitNode(props)} />,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3 text-sm leading-relaxed break-words",
        "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground",
        "[&_h4]:text-base [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold",
        "[&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_.task-list-item_input]:mr-2 [&_.task-list-item_input]:align-middle [&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
