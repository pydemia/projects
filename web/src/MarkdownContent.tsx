import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeMarkdownUrl } from "./ui";

export default function MarkdownContent({ body }: { body: string }) {
    return <div className="markdown"><ReactMarkdown skipHtml
        remarkPlugins={[remarkGfm]} urlTransform={safeMarkdownUrl}
        components={{
            a: ({ href, children }) => <a href={href || undefined}
                target="_blank" rel="noopener noreferrer">{children}</a>,
            img: ({ src, alt }) => <span className="image-reference">
                이미지 참조: <a href={typeof src === "string" ? src : undefined}
                    target="_blank" rel="noopener noreferrer">{alt || "원본 보기"}</a>
            </span>,
            table: ({ children }) => <div className="tablewrap"><table>{children}</table></div>,
        }}>{body || "아직 작성된 본문이 없습니다."}</ReactMarkdown></div>;
}
