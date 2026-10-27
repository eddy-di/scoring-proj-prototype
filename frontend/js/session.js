// The signed-in user (Django session), their roles and permissions.
//
// Screens check permissions, never role names, so a new role created in
// Django admin (e.g. one that may only edit methodologies) gets exactly the
// screens and buttons its permissions allow.
import * as api from './api.js';

let user = { authenticated: false, username: null, is_staff: false, is_superuser: false, permissions: [], roles: [] };

export const current = () => user;
export const signedIn = () => user.authenticated;
export const isStaff = () => user.authenticated && user.is_staff;
export const isSuperuser = () => user.authenticated && user.is_superuser;

// can('methodologies.publish_methodologyversion')
export const can = (perm) => user.authenticated && (user.is_superuser || user.permissions.includes(perm));

// May change something in an app, e.g. canManage('catalogs').
export const canManage = (app) => user.authenticated && (user.is_superuser
  || user.permissions.some((p) => p.startsWith(`${app}.`) && !p.startsWith(`${app}.view_`)));

// Sees every user's assessments, not only their own.
export const seesAllAssessments = () => can('assessments.view_all_assessments');
// Sees draft methodologies and the methodology editor.
export const seesMethodologies = () => can('methodologies.view_methodologyversion');
// Any part of the admin dashboard.
export const usesAdmin = () => canManage('catalogs') || canManage('library') || seesMethodologies() || seesAllAssessments();

const set = (u) => { user = u; return user; };

export const load = async () => set(await api.get('/api/auth/me/'));
export const login = async (username, password) => set(await api.post('/api/auth/login/', { username, password }));
export const register = async (data) => set(await api.post('/api/auth/register/', data));
export const logout = async () => set(await api.post('/api/auth/logout/'));
export const updateProfile = async (data) => set(await api.patch('/api/auth/me/', data));
export const changePassword = (data) => api.post('/api/auth/password/', data);
