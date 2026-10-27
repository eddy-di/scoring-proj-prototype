"""Django settings for the qualimetry scoring backend.

Development defaults: SQLite, DEBUG on. Set POSTGRES_DB (and the other
POSTGRES_* variables) to use PostgreSQL, the database schema.dbml targets.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-only-change-me')
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    # modeltranslation must come before django.contrib.admin.
    'modeltranslation',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'drf_spectacular',
    'rosetta',
    'catalogs',
    'library',
    'methodologies',
    'assessments',
    # Last, so the other apps' permissions exist when it creates the built-in roles.
    'accounts',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    # Picks the language from the django_language cookie, then the Accept-Language header.
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

if os.environ.get('POSTGRES_DB'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ['POSTGRES_DB'],
            'USER': os.environ.get('POSTGRES_USER', 'postgres'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
            'ATOMIC_REQUESTS': True,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            'ATOMIC_REQUESTS': True,
            # The frontend sends several requests at once. IMMEDIATE transactions and
            # WAL mode stop them failing with "database is locked".
            'OPTIONS': {
                'timeout': 20,
                'transaction_mode': 'IMMEDIATE',
                'init_command': 'PRAGMA journal_mode=WAL;',
            },
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── Languages ──────────────────────────────────────────────────
# English is the main language: it is the fallback for missing translations.
LANGUAGE_CODE = 'en'
LANGUAGES = [
    ('en', 'English'),
    ('ru', 'Русский'),
    ('ky', 'Кыргызча'),
]
LOCALE_PATHS = [BASE_DIR / 'locale']
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

# Content translation (django-modeltranslation). Translated fields get one column per
# language, e.g. questions.text_en, text_ru, text_ky.
MODELTRANSLATION_DEFAULT_LANGUAGE = 'en'
MODELTRANSLATION_FALLBACK_LANGUAGES = ('en',)
# Languages that must be filled in for every required text (in the API and Django admin).
# Optional texts, such as descriptions, stay optional in every language.
MODELTRANSLATION_REQUIRED_LANGUAGES = tuple(
    os.environ.get('REQUIRED_CONTENT_LANGUAGES', ','.join(code for code, _ in LANGUAGES)).split(','))

# Rosetta edits the .po files in locale/: backend texts (django.po) and frontend texts (djangojs.po).
ROSETTA_SHOW_AT_ADMIN_PANEL = True
ROSETTA_MESSAGES_SOURCE_LANGUAGE_CODE = 'en'
ROSETTA_MESSAGES_SOURCE_LANGUAGE_NAME = 'English'
ROSETTA_EXCLUDED_APPLICATIONS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
                                 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
                                 'rest_framework', 'drf_spectacular', 'modeltranslation', 'rosetta']

# The frontend prototype, served at / (see config/urls.py).
FRONTEND_DIR = BASE_DIR.parent / 'frontend'

# ── Browser security headers ───────────────────────────────────
# Settings only: SecurityMiddleware and XFrameOptionsMiddleware already run on every response.
# The Content-Security-Policy is a <meta> tag in frontend/index.html (see frontend/js/security.js).
X_FRAME_OPTIONS = 'DENY'                      # no framing (clickjacking)
SECURE_CONTENT_TYPE_NOSNIFF = True            # JSON is never run as a script (JSON hijacking)
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
SESSION_COOKIE_HTTPONLY = True                # scripts can't read the session cookie
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Set DJANGO_HTTPS=1 when the site is served over HTTPS: HTTP is redirected, browsers are told to
# use HTTPS only (HSTS), and cookies are never sent over plain HTTP. Off for runserver on localhost.
if os.environ.get('DJANGO_HTTPS') == '1':
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Behind a reverse proxy that terminates TLS and sets X-Forwarded-Proto.
    if os.environ.get('DJANGO_BEHIND_PROXY') == '1':
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# POST /api/demo/reset/ replaces all data with the example fixtures. Never enable in production.
DEMO_RESET_ENABLED = os.environ.get('DEMO_RESET_ENABLED', '1' if DEBUG else '0') == '1'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    # Signed-in users can read what their role may see; changes need Django permissions (see config/permissions.py).
    'DEFAULT_PERMISSION_CLASSES': ['config.permissions.RolePermission'],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'config.api.exception_handler',
    # numeric(…) columns are returned as JSON numbers, not strings.
    'COERCE_DECIMAL_TO_STRING': False,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Qualimetry scoring – admin API',
    'DESCRIPTION': 'Endpoints behind the custom admin panels: catalogs, question library and methodology editor.',
    'VERSION': '0.1.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SERVE_PERMISSIONS': ['rest_framework.permissions.AllowAny'],
    'COMPONENT_SPLIT_REQUEST': True,
}
