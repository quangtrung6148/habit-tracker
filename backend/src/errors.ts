export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function databaseError(error: { code?: string; message?: string }): ApiError {
  const message = error.message ?? '';
  if (message.includes('PROFILE_REQUIRED') || message === 'Profile required') return new ApiError(409, 'PROFILE_REQUIRED', 'Vui lòng chọn múi giờ trước khi tiếp tục.');
  if (message.includes('HABIT_DELETED') || ['Habit archived', 'Habit unavailable'].includes(message)) return new ApiError(409, 'HABIT_DELETED', 'Thói quen đã được xóa hoặc không còn khả dụng.');
  if (message.includes('HABIT_INACTIVE') || message === 'Habit paused') return new ApiError(409, 'HABIT_INACTIVE', 'Thói quen đang tạm dừng.');
  if (message.includes('CHECKIN_TODAY_ONLY') || message === 'Only today can be changed') return new ApiError(409, 'CHECKIN_TODAY_ONLY', 'Chỉ có thể thay đổi check-in hôm nay.');
  if (error.code === '23505') return new ApiError(409, 'CONFLICT', 'Dữ liệu đã tồn tại.');
  if (error.code === '42501') return new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
  if (['23514', '23502', '23503', '22P02', '22023'].includes(error.code ?? '')) return new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  if (error.code === 'P0001') return new ApiError(409, 'BUSINESS_RULE', 'Thao tác không phù hợp với trạng thái hiện tại.');
  return new ApiError(503, 'DATABASE_UNAVAILABLE', 'Không thể truy cập dữ liệu. Vui lòng thử lại.');
}
