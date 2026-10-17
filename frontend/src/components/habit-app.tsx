"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Globe2,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sprout,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  Checkin,
  Habit,
  HabitList,
  Pagination,
  Profile,
  Progress,
  Summary,
} from "@/lib/types";

type View = "dashboard" | "habits" | "profile";
const colors = [
  "#6366f1",
  "#8b5cf6",
  "#0d9488",
  "#e87945",
  "#db6c9c",
  "#4d8ce7",
];
const icons = ["🌱", "📚", "🏃", "💧", "🧘", "✍️", "🎯", "🌙"];
const dayLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) =>
  new Intl.DateTimeFormat("vi-VN", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
function percent(value: number | null | undefined) {
  return `${Math.round(value || 0)}%`;
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Đóng"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function HabitForm({
  habit,
  onClose,
  onSave,
}: {
  habit?: Habit;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState(habit?.color || colors[0]);
  const [icon, setIcon] = useState(habit?.icon || icons[0]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: String(form.get("title")).trim(),
        description: String(form.get("description")).trim() || null,
        icon,
        color,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa lưu được. Thử lại nhé.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={habit ? "Chỉnh sửa thói quen" : "Một thói quen mới"}
      onClose={onClose}
    >
      <p className="muted modal-intro">
        Bắt đầu nhỏ thôi. Điều quan trọng là đều đặn mỗi ngày.
      </p>
      <form onSubmit={submit}>
        <label>
          Tên thói quen <span className="required">*</span>
          <input
            name="title"
            defaultValue={habit?.title}
            placeholder="Ví dụ: Đọc sách 20 phút"
            required
            maxLength={120}
            autoFocus
          />
        </label>
        <label>
          Mô tả <span className="optional">(không bắt buộc)</span>
          <textarea
            name="description"
            defaultValue={habit?.description || ""}
            placeholder="Một lời nhắc nhỏ dành cho chính mình…"
            maxLength={2000}
            rows={3}
          />
        </label>
        <fieldset>
          <legend>Biểu tượng</legend>
          <div className="icon-options">
            {icons.map((item) => (
              <label
                key={item}
                className={`emoji-option ${icon === item ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="icon"
                  value={item}
                  checked={icon === item}
                  onChange={() => setIcon(item)}
                />
                <span>{item}</span>
                <span className="sr-only">Chọn {item}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Màu sắc</legend>
          <div className="color-options">
            {colors.map((item) => (
              <label
                key={item}
                className="color-option"
                style={{ backgroundColor: item }}
              >
                <input
                  type="radio"
                  name="color"
                  value={item}
                  checked={color === item}
                  onChange={() => setColor(item)}
                />
                <span>{color === item && <Check size={17} />}</span>
                <span className="sr-only">Màu {item}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-hint">
          <CalendarDays size={16} /> Lặp lại mỗi ngày · Có thể bắt đầu ngay hôm
          nay
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Để sau
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Đang lưu…" : habit ? "Lưu thay đổi" : "Tạo thói quen"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("profile", "POST", { timezone: data.get("timezone") });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <div className="empty-icon">
        <Globe2 size={32} />
      </div>
      <p className="eyebrow">MỘT CHÚT TRƯỚC KHI BẮT ĐẦU</p>
      <h2>Một ngày của bạn bắt đầu ở đâu?</h2>
      <p className="muted">
        Nếp dùng múi giờ này để ghi nhận hôm nay và tính chuỗi ngày. Khi đi du
        lịch, ngày theo dõi của bạn vẫn giữ nguyên.
      </p>
      <form onSubmit={submit}>
        <label>
          Múi giờ
          <input
            list="timezones"
            name="timezone"
            defaultValue="Asia/Ho_Chi_Minh"
            required
            maxLength={100}
            autoComplete="off"
          />
          <datalist id="timezones">
            {[
              "Asia/Ho_Chi_Minh",
              "Asia/Bangkok",
              "Asia/Tokyo",
              "Asia/Seoul",
              "Asia/Singapore",
              "Australia/Sydney",
              "Europe/London",
              "Europe/Paris",
              "America/New_York",
              "America/Los_Angeles",
              "UTC",
            ].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" required />
          Tôi hiểu múi giờ được chọn một lần và không thể đổi sau đó.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Đang chuẩn bị…" : "Sẵn sàng bắt đầu"}
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}

function HabitCard({
  habit,
  busy,
  onCheck,
  onOpen,
}: {
  habit: Habit;
  busy: boolean;
  onCheck: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={`habit-card ${habit.completed_today ? "is-complete" : ""} ${!habit.is_active ? "is-paused" : ""}`}
    >
      <span
        className="habit-emoji"
        style={{ backgroundColor: `${habit.color}15`, color: habit.color }}
      >
        {habit.icon}
      </span>
      <button className="habit-info" onClick={onOpen}>
        <span className="habit-title">{habit.title}</span>
        <span className="habit-sub">
          {!habit.is_active
            ? "Đang tạm dừng"
            : habit.completed_today
              ? "Bạn đã làm được hôm nay!"
              : habit.description || "Một chút mỗi ngày, một bước tiến xa"}
        </span>
      </button>
      <span
        className={`streak-chip ${habit.current_streak ? "" : "muted-streak"}`}
      >
        <Flame size={15} /> {habit.current_streak}
        <span className="desktop-label"> ngày</span>
      </span>
      <button
        className={`check-button ${habit.completed_today ? "checked" : ""}`}
        onClick={onCheck}
        disabled={busy || (!habit.is_active && !habit.completed_today)}
        aria-label={`${habit.completed_today ? "Bỏ hoàn thành" : "Hoàn thành"} ${habit.title}`}
        aria-pressed={habit.completed_today}
      >
        {busy ? (
          <RefreshCw size={19} className="spin" />
        ) : habit.completed_today ? (
          <Check size={21} strokeWidth={2.7} />
        ) : (
          <Circle size={23} />
        )}
      </button>
      <button
        className="icon-button habit-more"
        aria-label={`Chi tiết ${habit.title}`}
        onClick={onOpen}
      >
        <MoreHorizontal size={21} />
      </button>
    </article>
  );
}

function HabitDetail({
  habit,
  busy,
  onClose,
  onEdit,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [history, setHistory] = useState<Checkin[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api<{ checkins: Checkin[]; pagination: Pagination }>(
      `habits/${habit.id}/checkins?page=${page}&limit=14`,
    )
      .then((data) => {
        if (!cancelled) {
          setHistory(data.checkins);
          setPagination(data.pagination);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [habit.id, page, habit.completed_today]);
  return (
    <Modal title="Hành trình của bạn" onClose={onClose}>
      <div className="detail-heading">
        <span
          className="detail-emoji"
          style={{ backgroundColor: `${habit.color}16` }}
        >
          {habit.icon}
        </span>
        <h3>{habit.title}</h3>
        <p className="muted">
          {habit.description ||
            "Những thay đổi nhỏ tạo nên một hành trình lớn."}
        </p>
        <span className={`status-pill ${habit.is_active ? "active" : ""}`}>
          {habit.deleted_at
            ? "Đã xóa · Lưu giữ lịch sử"
            : habit.is_active
              ? "Đang nuôi dưỡng mỗi ngày"
              : "Đang tạm dừng"}
        </span>
      </div>
      <div className="detail-stats">
        <div>
          <Flame size={20} />
          <strong>{habit.current_streak}</strong>
          <span>Chuỗi hiện tại</span>
        </div>
        <div>
          <Trophy size={20} />
          <strong>{habit.longest_streak}</strong>
          <span>Chuỗi dài nhất</span>
        </div>
      </div>
      <div className="section-heading">
        <h3>Lịch sử hoàn thành</h3>
        <span className="muted">{pagination?.total || 0} ngày</span>
      </div>
      {loading ? (
        <div className="skeleton history-skeleton" />
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : history.length ? (
        <div className="history-list">
          {history.map((checkin) => (
            <div key={checkin.id}>
              <span className="history-check">
                <Check size={15} />
              </span>
              <span>
                {dayLabel(checkin.checkin_date, {
                  weekday: "long",
                  day: "numeric",
                  month: "numeric",
                  year: "numeric",
                })}
              </span>
              <span className="history-done">Hoàn thành</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="history-empty">
          Chưa có ngày hoàn thành. Bước đầu tiên đang chờ bạn.
        </p>
      )}
      {pagination && pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="icon-button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            aria-label="Lịch sử mới hơn"
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {page} / {pagination.totalPages}
          </span>
          <button
            className="icon-button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
            aria-label="Lịch sử cũ hơn"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      <p className="detail-note">
        Chỉ có thể đánh dấu hoặc bỏ hoàn thành trong hôm nay. Tạm dừng không giữ
        nguyên chuỗi nếu bỏ trọn một ngày.
      </p>
      {!habit.deleted_at && (
        <div className="detail-actions">
          <button className="button secondary" onClick={onEdit} disabled={busy}>
            <Pencil size={16} />
            Chỉnh sửa
          </button>
          <button
            className="button secondary"
            onClick={onToggle}
            disabled={busy}
          >
            {habit.is_active ? <Pause size={16} /> : <Play size={16} />}
            {habit.is_active ? "Tạm dừng" : "Tiếp tục"}
          </button>
          <button
            className="icon-button danger"
            onClick={onDelete}
            disabled={busy}
            aria-label="Xóa thói quen"
          >
            <Trash2 size={19} />
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function HabitApp({ email }: { email: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [list, setList] = useState<HabitList | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [selected, setSelected] = useState<Habit | null>(null);
  const requestSequence = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      if (err instanceof ApiError && err.code === "PROFILE_REQUIRED") {
        setProfile(null);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Chưa tải được dữ liệu. Vui lòng thử lại.",
      );
    },
    [router],
  );
  const load = useCallback(
    async (quiet = false) => {
      const sequence = ++requestSequence.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const me = await api<{ profile: Profile | null }>("auth/me");
        if (sequence !== requestSequence.current) return;
        setProfile(me.profile);
        if (me.profile) {
          const [nextSummary, nextProgress, nextList] = await Promise.all([
            api<Summary>("dashboard/summary"),
            api<Progress>("dashboard/progress"),
            api<HabitList>(`habits?status=${filter}&page=${page}&limit=20`),
          ]);
          if (sequence !== requestSequence.current) return;
          setSummary(nextSummary);
          setProgress(nextProgress);
          setList(nextList);
        }
      } catch (err) {
        if (sequence === requestSequence.current) handleError(err);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [filter, page, handleError],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    const id = new URLSearchParams(window.location.search).get("habit");
    if (id && /^[0-9a-f-]{36}$/.test(id)) {
      void api<{ habit: Habit }>("habits/" + id)
        .then((data) => {
          if (!cancelled) setSelected(data.habit);
        })
        .catch(handleError);
    }
    return () => {
      cancelled = true;
    };
  }, [handleError]);
  function openHabit(habit: Habit) {
    setSelected(habit);
    const url = new URL(window.location.href);
    url.searchParams.set("habit", habit.id);
    window.history.replaceState(null, "", url);
  }
  function closeDetail() {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("habit");
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    message: string,
    busyId: string,
  ) {
    setBusy(busyId);
    setError("");
    try {
      const result = await api<{ habit?: Habit }>(path, method, body);
      if (result.habit)
        setSelected((current) =>
          current?.id === result.habit!.id ? result.habit! : current,
        );
      await load(true);
      notify(message);
    } catch (err) {
      handleError(err);
      throw err;
    } finally {
      setBusy("");
    }
  }
  async function check(habit: Habit) {
    try {
      await mutate(
        `habits/${habit.id}/checkin`,
        habit.completed_today ? "DELETE" : "POST",
        {},
        habit.completed_today
          ? "Đã bỏ đánh dấu hôm nay."
          : "Thêm một bước tiến. Bạn làm tốt lắm! ✨",
        habit.id,
      );
    } catch {
      /* Error is shown in the page banner. */
    }
  }
  async function saveHabit(body: Record<string, unknown>) {
    await mutate(
      editing && editing !== "new" ? `habits/${editing.id}` : "habits",
      editing && editing !== "new" ? "PATCH" : "POST",
      body,
      editing === "new" ? "Đã gieo một thói quen mới. 🌱" : "Đã lưu thay đổi.",
      "form",
    );
  }
  async function toggle(habit: Habit) {
    try {
      await mutate(
        `habits/${habit.id}`,
        "PATCH",
        { is_active: !habit.is_active },
        habit.is_active
          ? "Đã tạm dừng. Trở lại khi bạn sẵn sàng."
          : "Chào mừng bạn trở lại!",
        habit.id,
      );
    } catch {
      /* Error is shown in the page banner. */
    }
  }
  async function remove(habit: Habit) {
    if (
      !window.confirm(
        `Xóa “${habit.title}”? Thói quen sẽ rời danh sách hôm nay. Lịch sử và thống kê các ngày trước vẫn được giữ lại.`,
      )
    )
      return;
    try {
      await mutate(
        `habits/${habit.id}`,
        "DELETE",
        {},
        "Đã xóa thói quen và giữ lại lịch sử.",
        habit.id,
      );
      setSelected((await api<{ habit: Habit }>(`habits/${habit.id}`)).habit);
    } catch {
      /* Error is shown in the page banner. */
    }
  }
  async function logout() {
    setBusy("logout");
    try {
      const result = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!result.ok) throw new Error("Chưa thể đăng xuất. Vui lòng thử lại.");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy("");
    }
  }
  const todayHabits =
    summary?.habits.filter((habit) => habit.is_active && !habit.deleted_at) ||
    [];
  const rate = Math.max(
    0,
    Math.min(100, Number(summary?.completion_rate) || 0),
  );
  const nav = [
    { key: "dashboard" as const, label: "Tổng quan", icon: LayoutDashboard },
    { key: "habits" as const, label: "Thói quen", icon: ListChecks },
    { key: "profile" as const, label: "Cá nhân", icon: Circle },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Nếp trang chủ">
          <Sprout size={30} />
          <span>
            nếp<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">GÓC NHỎ CỦA BẠN</div>
        <nav aria-label="Điều hướng chính">
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              onClick={() => setView(key)}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {view === key && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-leaf">
            <Leaf size={25} />
          </span>
          <h3>
            Chăm một chút,
            <br />
            lớn từng ngày.
          </h3>
          <p>Mỗi lần bạn xuất hiện cho chính mình đều đáng được ghi nhận.</p>
          <span className="tiny-stars">✦ · ✧</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{email.charAt(0).toUpperCase()}</div>
          <div>
            <strong>Không gian của bạn</strong>
            <span title={email}>{email}</span>
          </div>
          <button
            className="icon-button"
            onClick={logout}
            disabled={busy === "logout"}
            aria-label="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span className="topbar-breadcrumb">
            Không gian của bạn <ChevronRight size={13} />
            <strong>{nav.find((item) => item.key === view)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span className="today-badge">
              <span />
              Mỗi ngày một bước
            </span>
            <div className="avatar small">{email.charAt(0).toUpperCase()}</div>
          </div>
        </header>
        <div className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                onClick={() => void load(true)}
                className="button small-button"
              >
                <RefreshCw size={15} /> Thử lại
              </button>
            </div>
          )}
          {profile === null ? (
            <Onboarding onDone={() => void load()} />
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view === "profile"
                      ? "DÀNH CHO CHÍNH BẠN"
                      : summary
                        ? dayLabel(summary.today, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }).toUpperCase()
                        : "MỘT NGÀY MỚI, MỘT KHỞI ĐẦU MỚI"}
                  </p>
                  <h1>
                    {view === "dashboard" ? (
                      <>
                        Mỗi ngày, tốt hơn một chút
                        <span className="heading-spark">✦</span>
                      </>
                    ) : view === "habits" ? (
                      "Những hạt mầm của bạn"
                    ) : (
                      "Góc nhỏ của bạn"
                    )}
                  </h1>
                  <p className="muted">
                    {view === "dashboard"
                      ? "Một bước nhỏ hôm nay, một thay đổi lớn ngày mai."
                      : view === "habits"
                        ? "Chọn những điều quan trọng. Kiên trì theo cách của bạn."
                        : "Một không gian riêng để nuôi dưỡng chính mình."}
                  </p>
                </div>
                {view !== "profile" && (
                  <button
                    className="button primary"
                    aria-label="Thêm thói quen"
                    onClick={() => setEditing("new")}
                    disabled={!profile}
                  >
                    <Plus size={18} />
                    <span>Thêm thói quen</span>
                  </button>
                )}
              </section>
              {loading && !summary ? (
                <div
                  className="dashboard-skeleton"
                  aria-label="Đang tải dữ liệu"
                >
                  <div className="skeleton" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : !summary || !progress || !list ? (
                <section className="panel empty-habits">
                  <div className="empty-icon"><RefreshCw size={30} /></div>
                  <h3>Tiến bộ của bạn đang chờ được kết nối</h3>
                  <p>Chưa thể tải dữ liệu lúc này. Mình thử lại sau một chút nhé.</p>
                  <button className="button soft" onClick={() => void load()}>
                    <RefreshCw size={16} /> Thử tải lại
                  </button>
                </section>
              ) : view === "profile" ? (
                <section className="profile-card panel">
                  <div className="profile-avatar avatar">
                    {email.charAt(0).toUpperCase()}
                  </div>
                  <h2>Từng bước, theo nhịp của bạn.</h2>
                  <p className="muted">
                    Tài khoản giúp giữ lại tiến bộ của riêng bạn.
                  </p>
                  <dl>
                    <div>
                      <dt>Email</dt>
                      <dd>{email}</dd>
                    </div>
                    <div>
                      <dt>
                        <Globe2 size={17} />
                        Múi giờ theo dõi
                      </dt>
                      <dd>{profile?.timezone}</dd>
                    </div>
                  </dl>
                  <p className="detail-note">
                    Múi giờ được chọn một lần để giữ lịch sử nhất quán. Thói
                    quen và chuỗi ngày luôn theo múi giờ này, kể cả khi bạn đi
                    du lịch.
                  </p>
                  <button
                    className="button secondary"
                    onClick={logout}
                    disabled={busy === "logout"}
                  >
                    <LogOut size={18} />
                    {busy === "logout" ? "Đang đăng xuất…" : "Đăng xuất"}
                  </button>
                </section>
              ) : (
                <>
                  {view === "dashboard" && (
                    <>
                      <div className="overview-grid">
                        <section className="progress-hero">
                          <div className="hero-content">
                            <span className="hero-label">
                              <span className="hero-dot" /> HÔM NAY CỦA BẠN
                            </span>
                            <h2>
                              {summary?.total_habits
                                ? rate === 100
                                  ? "Bạn đã làm được rồi!"
                                  : "Cứ từng chút một,<br />bạn đang tiến lên."
                                      .split("<br />")
                                      .map((text, i) => (
                                        <span key={text}>
                                          {i > 0 && <br />}
                                          {text}
                                        </span>
                                      ))
                                : "Gieo một thói quen,<br />đón một khởi đầu."
                                    .split("<br />")
                                    .map((text, i) => (
                                      <span key={text}>
                                        {i > 0 && <br />}
                                        {text}
                                      </span>
                                    ))}
                            </h2>
                            <p>
                              {summary?.total_habits ? (
                                <>
                                  Đã hoàn thành{" "}
                                  <strong>
                                    {summary.completed_habits}/
                                    {summary.total_habits}
                                  </strong>{" "}
                                  thói quen hôm nay.
                                  <br />
                                  {rate === 100
                                    ? "Hãy dành một chút thời gian tự hào về mình."
                                    : "Mọi nỗ lực nhỏ đều có ý nghĩa."}
                                </>
                              ) : (
                                <>
                                  Chọn một điều nhỏ bạn muốn làm mỗi ngày.
                                  <br />
                                  Hành trình của bạn bắt đầu từ đây.
                                </>
                              )}
                            </p>
                            <span className="hero-foot">
                              <Leaf size={14} /> Tiến bộ hơn hoàn hảo
                            </span>
                          </div>
                          <div
                            className="progress-ring"
                            role="img"
                            aria-label={`Đã hoàn thành ${percent(rate)} thói quen hôm nay`}
                            style={{
                              background: `conic-gradient(#c8b8ff ${rate}%, #ffffff20 0)`,
                            }}
                          >
                            <div>
                              <strong>{percent(rate)}</strong>
                              <span>hoàn thành</span>
                            </div>
                          </div>
                          <span className="hero-spark" aria-hidden="true">
                            ✧
                          </span>
                        </section>
                        <section className="stat-card">
                          <div className="stat-icon lavender">
                            <ListChecks size={22} />
                          </div>
                          <span>Thói quen đang có</span>
                          <strong>
                            {summary?.total_habits || 0}
                            <small>thói quen</small>
                          </strong>
                          <div className="stat-foot">
                            <span className="tiny-dot purple" /> Hạt mầm cho mỗi
                            ngày
                          </div>
                        </section>
                        <section className="stat-card">
                          <div className="stat-icon peach">
                            <Trophy size={22} />
                          </div>
                          <span>Chuỗi dài nhất</span>
                          <strong>
                            {summary?.longest_streak || 0}
                            <small>ngày liên tiếp</small>
                          </strong>
                          <div className="stat-foot">
                            <Flame size={13} /> Kỷ lục của riêng bạn
                          </div>
                        </section>
                      </div>
                      <div className="dashboard-columns">
                        <section className="panel today-panel">
                          <div className="section-heading">
                            <div>
                              <h2>
                                Thói quen hôm nay{" "}
                                <span className="count-badge">
                                  {todayHabits.length}
                                </span>
                              </h2>
                              <p className="muted">
                                Chạm một lần để ghi nhận nỗ lực.
                              </p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => setView("habits")}
                            >
                              Xem tất cả
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          {todayHabits.length ? (
                            <div className="habit-stack">
                              {todayHabits.map((habit) => (
                                <HabitCard
                                  key={habit.id}
                                  habit={habit}
                                  busy={Boolean(busy)}
                                  onCheck={() => void check(habit)}
                                  onOpen={() => openHabit(habit)}
                                />
                              ))}
                            </div>
                          ) : (
                            <EmptyHabits onAdd={() => setEditing("new")} />
                          )}
                          <div className="today-panel-foot">
                            <span>
                              <Sprout size={15} />
                              Không cần làm mọi thứ. Chỉ cần bắt đầu.
                            </span>
                            <span>
                              {summary?.completed_habits || 0} /{" "}
                              {summary?.total_habits || 0}
                            </span>
                          </div>
                        </section>
                        <section className="panel week-panel">
                          <div className="section-heading">
                            <div>
                              <h2>Nhịp điệu 7 ngày</h2>
                              <p className="muted">
                                Nhìn lại từng bước nhỏ của bạn.
                              </p>
                            </div>
                            <div className="subtle-icon">
                              <BarChart3 size={19} />
                            </div>
                          </div>
                          <div
                            className="chart"
                            aria-label="Tỷ lệ hoàn thành trong 7 ngày gần nhất"
                          >
                            {progress?.days.map((day) => (
                              <div
                                className={`chart-column ${day.date === summary?.today ? "is-today" : ""}`}
                                key={day.date}
                              >
                                <span className="chart-value">
                                  {day.total_habits
                                    ? percent(Number(day.completion_rate))
                                    : "—"}
                                </span>
                                <div className="chart-track">
                                  <div
                                    className="chart-bar"
                                    style={{
                                      height: `${Math.max(0, Math.min(100, Number(day.completion_rate) || 0))}%`,
                                    }}
                                  />
                                  <span className="sr-only">
                                    {dayLabel(day.date)}: {day.completed_habits}
                                    /{day.total_habits} thói quen
                                  </span>
                                </div>
                                <span className="chart-label">
                                  {day.date === summary?.today
                                    ? "Nay"
                                    : dayLabel(day.date, { weekday: "short" })}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="chart-legend">
                            <span className="tiny-dot purple" /> Tỷ lệ hoàn
                            thành
                            <span className="chart-no-data">
                              — Chưa có thói quen
                            </span>
                          </div>
                          <div className="week-quote">
                            <span>✦</span>
                            <p>
                              Một ngày chưa trọn vẹn
                              <br />
                              không xóa đi cả hành trình.
                            </p>
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                  {view === "habits" && (
                    <section className="panel habits-panel">
                      <div className="section-heading">
                        <div>
                          <h2>
                            Thói quen của bạn{" "}
                            <span className="count-badge">
                              {list?.pagination.total || 0}
                            </span>
                          </h2>
                          <p className="muted">
                            Mỗi thói quen là một lời hứa nhỏ với bản thân.
                          </p>
                        </div>
                        <div className="filter-tabs" aria-label="Lọc thói quen">
                          {[
                            { value: "all", label: "Tất cả" },
                            { value: "active", label: "Đang theo dõi" },
                            { value: "paused", label: "Tạm dừng" },
                          ].map((item) => (
                            <button
                              key={item.value}
                              aria-pressed={filter === item.value}
                              className={filter === item.value ? "active" : ""}
                              onClick={() => {
                                setFilter(item.value);
                                setPage(1);
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {list?.habits.length ? (
                        <div className="habit-stack">
                          {list.habits.map((habit) => (
                            <HabitCard
                              key={habit.id}
                              habit={habit}
                              busy={Boolean(busy)}
                              onCheck={() => void check(habit)}
                              onOpen={() => openHabit(habit)}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyHabits
                          onAdd={() => setEditing("new")}
                          paused={filter === "paused"}
                        />
                      )}
                      {list && list.pagination.totalPages > 1 && (
                        <div className="pagination">
                          <button
                            className="button secondary"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(page - 1)}
                          >
                            <ChevronLeft size={17} />
                            Trước
                          </button>
                          <span>
                            Trang {page} / {list.pagination.totalPages}
                          </span>
                          <button
                            className="button secondary"
                            disabled={
                              page >= list.pagination.totalPages || loading
                            }
                            onClick={() => setPage(page + 1)}
                          >
                            Sau
                            <ChevronRight size={17} />
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span className="footer-brand">
              <Sprout size={16} /> nếp.
            </span>
            <span>Đều đặn một chút. Dịu dàng với chính mình.</span>
            <span className="footer-timezone">
              {profile?.timezone || "Mỗi ngày một bước"}
            </span>
          </footer>
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">
        {nav.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={16} />
          </span>
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Đóng thông báo"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <HabitForm
          habit={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={saveHabit}
        />
      )}
      {selected && (
        <HabitDetail
          habit={selected}
          busy={Boolean(busy)}
          onClose={closeDetail}
          onEdit={() => {
            setEditing(selected);
            closeDetail();
          }}
          onToggle={() => void toggle(selected)}
          onDelete={() => void remove(selected)}
        />
      )}
    </div>
  );
}

function EmptyHabits({
  onAdd,
  paused = false,
}: {
  onAdd: () => void;
  paused?: boolean;
}) {
  return (
    <div className="empty-habits">
      <div className="empty-icon">
        <Sprout size={32} />
      </div>
      <h3>
        {paused ? "Chưa có thói quen tạm dừng" : "Bắt đầu từ một điều nhỏ"}
      </h3>
      <p>
        {paused
          ? "Các thói quen tạm dừng sẽ xuất hiện ở đây."
          : "Một trang sách, một cốc nước, một phút cho mình. Thói quen đầu tiên của bạn là gì?"}
      </p>
      {!paused && (
        <button className="button soft" onClick={onAdd}>
          <Plus size={17} />
          Gieo thói quen đầu tiên
        </button>
      )}
    </div>
  );
}
