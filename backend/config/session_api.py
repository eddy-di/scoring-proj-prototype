"""Accounts for the frontend, mounted at /api/auth/: sign up, sign in, profile, password.
They use Django sessions."""
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, password_validation, update_session_auth_hash
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext as _
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from assessments.models import Assessment, AssessmentStatus

from .demo import reset_demo_data
from .i18n import languages_payload

User = get_user_model()
PROFILE_FIELDS = ['first_name', 'last_name', 'email', 'organization', 'position', 'phone', 'preferred_language']


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = PROFILE_FIELDS

    def validate_email(self, email):
        clash = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if email and clash.exists():
            raise serializers.ValidationError(_('An account with this email already exists.'))
        return email


class RegisterSerializer(ProfileSerializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    class Meta(ProfileSerializer.Meta):
        fields = ['username', 'password', *PROFILE_FIELDS]
        extra_kwargs = {'email': {'required': True, 'allow_blank': False}}

    def validate(self, attrs):
        candidate = User(**{k: v for k, v in attrs.items() if k != 'password'})
        try:
            password_validation.validate_password(attrs['password'], candidate)
        except DjangoValidationError as e:
            raise serializers.ValidationError({'password': e.messages}) from None
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class PasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(style={'input_type': 'password'})
    new_password = serializers.CharField(style={'input_type': 'password'})

    def validate_current_password(self, value):
        if not self.context['user'].check_password(value):
            raise serializers.ValidationError(_('The current password is wrong.'))
        return value

    def validate_new_password(self, value):
        try:
            password_validation.validate_password(value, self.context['user'])
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={'input_type': 'password'})


class UserSerializer(serializers.Serializer):
    authenticated = serializers.BooleanField()
    id = serializers.IntegerField(allow_null=True)
    username = serializers.CharField(allow_null=True)
    display_name = serializers.CharField(allow_null=True)
    is_staff = serializers.BooleanField(help_text='Member of a staff role (or superuser)')
    is_superuser = serializers.BooleanField()
    roles = serializers.ListField(child=serializers.CharField())
    permissions = serializers.ListField(child=serializers.CharField(), help_text='app_label.codename of every permission')
    profile = serializers.DictField(allow_null=True)
    stats = serializers.DictField(allow_null=True)
    demo_reset_enabled = serializers.BooleanField()
    language = serializers.CharField(help_text='Active language of this request')
    languages = serializers.ListField(child=serializers.DictField(), help_text='[{code, name}] from settings.LANGUAGES')
    default_language = serializers.CharField()
    required_languages = serializers.ListField(child=serializers.CharField())
    translated_fields = serializers.DictField(help_text='table → {field: required}')


def user_payload(user):
    signed_in = user.is_authenticated
    assessments = Assessment.objects.filter(respondent=user) if signed_in else Assessment.objects.none()
    return {
        'authenticated': signed_in,
        'id': user.pk if signed_in else None,
        'username': user.get_username() if signed_in else None,
        'display_name': user.display_name if signed_in else None,
        'is_staff': signed_in and user.is_staff,
        'is_superuser': signed_in and user.is_superuser,
        'roles': [g.name for g in user.groups.all()] if signed_in else [],
        'permissions': sorted(user.get_all_permissions()) if signed_in else [],
        'profile': {**ProfileSerializer(user).data, 'date_joined': user.date_joined} if signed_in else None,
        'stats': {
            'assessments': assessments.count(),
            'completed': assessments.filter(status=AssessmentStatus.COMPLETED).count(),
            'last_started_at': assessments.order_by('-created_at').values_list('created_at', flat=True).first(),
        } if signed_in else None,
        'demo_reset_enabled': settings.DEMO_RESET_ENABLED,
        **languages_payload(),
    }


def with_language(response, user):
    """Signing in switches the interface to the user's preferred language."""
    if user.is_authenticated and user.preferred_language:
        response.set_cookie(settings.LANGUAGE_COOKIE_NAME, user.preferred_language, max_age=365 * 24 * 3600,
                            samesite='Lax')
    return response


@extend_schema(methods=['GET'], responses=UserSerializer, summary='The signed-in user; also sets the CSRF cookie')
@extend_schema(methods=['PATCH'], request=ProfileSerializer, responses=UserSerializer, summary='Update your profile')
@api_view(['GET', 'PATCH'])
@permission_classes([AllowAny])
def me(request):
    if request.method == 'PATCH':
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_403_FORBIDDEN)
        data = ProfileSerializer(request.user, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return with_language(Response(user_payload(request.user)), request.user)
    return Response(user_payload(request.user))


me = ensure_csrf_cookie(me)


@extend_schema(request=RegisterSerializer, responses={201: UserSerializer}, summary='Create an account and sign in')
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    data = RegisterSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    user = data.save()
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    return with_language(Response(user_payload(user), status=status.HTTP_201_CREATED), user)


@extend_schema(request=LoginSerializer, responses=UserSerializer)
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    data = LoginSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    user = authenticate(request, **data.validated_data)
    if user is None:
        return Response({'detail': _('Wrong username or password.')}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return with_language(Response(user_payload(user)), user)


@extend_schema(request=None, responses=UserSerializer)
@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    logout(request)
    return Response(user_payload(request.user))


@extend_schema(request=PasswordSerializer, responses={204: None}, summary='Change your password')
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    data = PasswordSerializer(data=request.data, context={'user': request.user})
    data.is_valid(raise_exception=True)
    request.user.set_password(data.validated_data['new_password'])
    request.user.save()
    update_session_auth_hash(request, request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={204: None}, summary='Replace all data with the example data (demo only)')
@api_view(['POST'])
@permission_classes([IsAdminUser])
def demo_reset(request):
    if not settings.DEMO_RESET_ENABLED:
        return Response({'detail': _('Demo reset is turned off on this server.')}, status=status.HTTP_403_FORBIDDEN)
    reset_demo_data()
    return Response(status=status.HTTP_204_NO_CONTENT)
