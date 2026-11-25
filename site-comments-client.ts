export type CommentView = 'public' | 'mine' | 'manage';
export type Comment = {
  id: string; author_name: string; visibility: 'public' | 'private';
  message: string; admin_reply: string | null; created_at: string;
};
export type CommentPage = { comments: Comment[]; hasNext: boolean };
export type CommentAccess = { canComment: boolean; canManage: boolean };
export type CommentDraft = Pick<Comment, 'id' | 'visibility' | 'message'>;

export class CommentsError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const endpoint = '/api/account?siteComments=1';
const unavailable = 'ارتباط با بخش نظرات برقرار نشد. دوباره تلاش کنید.';

export async function commentsRequest<T>(query = '', body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint + query, {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
      ...(body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : {}),
    });
  } catch { throw new CommentsError(0, unavailable); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new CommentsError(response.ok ? 0 : response.status, result?.error || unavailable);
  }
  return result as T;
}

async function acknowledged(draft: CommentDraft) {
  const result = await commentsRequest<{ comment: Comment }>('&scope=receipt&id=' + encodeURIComponent(draft.id))
    .catch(() => undefined);
  const comment = result?.comment;
  return comment && comment.message === draft.message && comment.visibility === draft.visibility ? comment : undefined;
}

export async function submitComment(draft: CommentDraft, retry: boolean, checking: () => void) {
  if (retry) {
    const previous = await acknowledged(draft);
    if (previous) return previous;
  }
  try {
    const result = await commentsRequest<{ comment?: Comment }>('', { action: 'submit', ...draft });
    if (result.comment) return result.comment;
  } catch (error) {
    if (error instanceof CommentsError && error.status >= 400 && error.status < 500) throw error;
  }
  checking();
  const saved = await acknowledged(draft);
  if (saved) return saved;
  throw new CommentsError(0, 'ثبت نظر هنوز تأیید نشد. دوباره روی «ارسال نظر» بزنید تا همان نظر پیگیری شود.');
}
