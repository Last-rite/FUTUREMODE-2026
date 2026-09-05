import { demoApi } from '../demo-backend/api.js';
import { httpApi } from './httpApi.js';

export const isHttpBackend = import.meta.env.VITE_BACKEND_MODE === 'http';
export const gameApi = isHttpBackend ? httpApi : demoApi;

