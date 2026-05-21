// TODAS las respuestas exitosas del API siguen este formato:
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// Respuesta paginada (listados con muchos registros):
export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

// Respuesta de error de validacion (HTTP 422):
export interface ValidationErrorResponse {
  success: false;
  message: string;
  errors: Record<string, string[]>;
}
