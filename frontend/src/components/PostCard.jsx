import { BookOpenCheck, Home, Megaphone, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const KINDS = {
  classwork: { label: "Classwork", icon: BookOpenCheck, tone: "bg-[#E8ECFF] text-[#2B4BFF]" },
  homework: { label: "Homework", icon: Home, tone: "bg-amber-50 text-amber-700" },
  notice: { label: "Notice", icon: Megaphone, tone: "bg-violet-50 text-violet-700" },
};

export default function PostCard({ post, className, onDelete, onPublish, isNew = false, showClass = true }) {
  const k = KINDS[post.kind] || KINDS.notice;
  return (
    <article className={`rounded-2xl border bg-white p-4 sm:p-5 ${post.status === "draft" ? "border-dashed border-amber-300 bg-amber-50/40" : isNew ? "border-[#2B4BFF]/40 ring-1 ring-[#2B4BFF]/20" : "border-[#E7E9F1]"}`} data-testid={`post-${post.id}`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 shrink-0 grid place-items-center rounded-xl ${k.tone}`}>
          <k.icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className={`pill ${k.tone}`}>{k.label}</span>
            {post.status === "draft" && <span className="pill bg-amber-100 text-amber-800 font-semibold" data-testid="draft-pill">Draft, parents can't see this yet</span>}
            {isNew && <span className="pill bg-[#2B4BFF] text-white font-semibold" data-testid="new-pill">New</span>}
            {post.subject && <span className="font-medium text-slate-700">{post.subject}</span>}
            {showClass && className && <span>{className}</span>}
            <span>{formatDate(post.date)}</span>
          </div>
          <h3 className="font-heading text-base font-semibold mt-1.5 break-words">{post.title}</h3>
          {post.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line break-words">{post.body}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {post.due_date && <span className="font-medium text-amber-700">Due {formatDate(post.due_date)}</span>}
            {post.created_by_name && <span>Posted by {post.created_by_name}</span>}
          </div>
        </div>
        {onPublish && post.status === "draft" && (
          <button type="button" onClick={() => onPublish(post)} data-testid={`publish-${post.id}`} className="ui-btn btn-primary text-xs !px-3 !py-1.5 shrink-0">Post to parents</button>
        )}
        {onDelete && (
          <button type="button" onClick={() => onDelete(post)} aria-label="Delete post" title="Delete"
            className="h-9 w-9 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
