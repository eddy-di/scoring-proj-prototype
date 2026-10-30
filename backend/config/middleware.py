"""Small response tweaks for the API."""
from django.utils.cache import patch_cache_control


def api_revalidate(get_response):
    """API responses may be kept by the browser but must be checked first (Cache-Control: private, no-cache).

    With ConditionalGetMiddleware's ETag, a list that hasn't changed comes back as an empty 304 instead of
    the whole body again.
    """
    def middleware(request):
        response = get_response(request)
        if request.path.startswith('/api/') and not response.has_header('Cache-Control'):
            patch_cache_control(response, private=True, no_cache=True)
        return response
    return middleware
