from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.i18n import JSONCatalog
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from . import session_api

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/admin/', include('config.api_urls')),
    path('api/respondent/', include('config.respondent_urls')),
    path('api/auth/me/', session_api.me, name='auth-me'),
    path('api/auth/login/', session_api.login_view, name='auth-login'),
    path('api/auth/logout/', session_api.logout_view, name='auth-logout'),
    path('api/auth/register/', session_api.register, name='auth-register'),
    path('api/auth/password/', session_api.change_password, name='auth-password'),
    path('api/demo/reset/', session_api.demo_reset, name='demo-reset'),
    # Frontend texts for the active language (locale/*/LC_MESSAGES/djangojs.po).
    path('api/i18n/catalog/', JSONCatalog.as_view(domain='djangojs'), name='js-catalog'),
    path('rosetta/', include('rosetta.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='docs'),
    path('api-auth/', include('rest_framework.urls')),
    # The frontend (../frontend), served from the same origin so it can use the session cookie.
    # Fine for development and demos; serve these files with a web server in production.
    path('', serve, {'path': 'index.html', 'document_root': settings.FRONTEND_DIR}, name='frontend'),
    re_path(r'^(?P<path>(?:js|css)/.+)$', serve, {'document_root': settings.FRONTEND_DIR}),
]
