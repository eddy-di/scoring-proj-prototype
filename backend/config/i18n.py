"""Multilingual content in the API (django-modeltranslation).

For every translated field, e.g. `name`, a serializer with TranslatedSerializerMixin
- returns `name` in the language of the request (falling back to English), read-only;
- reads and writes `name_en`, `name_ru`, `name_ky`, … for the languages in settings.LANGUAGES;
- requires a value in every language of MODELTRANSLATION_REQUIRED_LANGUAGES when the
  field itself is required (blank=False). Optional fields stay optional.
"""
from django.conf import settings
from django.utils import translation
from django.utils.translation import gettext as _
from modeltranslation.translator import NotRegistered, translator
from rest_framework import serializers

LANGUAGE_CODES = [code for code, _name in settings.LANGUAGES]
LANGUAGE_NAMES = dict(settings.LANGUAGES)


def required_languages():
    return [code for code in settings.MODELTRANSLATION_REQUIRED_LANGUAGES if code in LANGUAGE_CODES]


def translated_fields(model):
    """Names of the translated fields of a model, e.g. ['name', 'description']."""
    try:
        return list(translator.get_options_for_model(model).fields)
    except NotRegistered:
        return []


def is_required(model, field):
    return not model._meta.get_field(field).blank


def in_every_language(text):
    """{'name_en': 'New group', 'name_ru': 'Новая группа', …} for a gettext_lazy text."""
    values = {}
    for code in LANGUAGE_CODES:
        with translation.override(code):
            values[code] = str(text)
    return values


class TranslatedSerializerMixin:
    def get_field_names(self, declared_fields, info):
        names = list(super().get_field_names(declared_fields, info))
        for field in translated_fields(self.Meta.model):
            names += [f'{field}_{code}' for code in LANGUAGE_CODES if f'{field}_{code}' not in names]
        return names

    def get_extra_kwargs(self):
        kwargs = super().get_extra_kwargs()
        for field in translated_fields(self.Meta.model):
            kwargs.setdefault(field, {})['read_only'] = True
            for code in LANGUAGE_CODES:
                kwargs.setdefault(f'{field}_{code}', {}).update(required=False, allow_null=True, allow_blank=True)
        return kwargs

    def to_internal_value(self, data):
        attrs = super().to_internal_value(data)
        model = self.Meta.model
        errors = {}
        for field in translated_fields(model):
            for code in LANGUAGE_CODES:
                key = f'{field}_{code}'
                if isinstance(attrs.get(key), str):
                    attrs[key] = attrs[key].strip() or None
                if not is_required(model, field) or code not in required_languages():
                    continue
                current = attrs[key] if key in attrs else getattr(self.instance, key, None)
                if not current:
                    errors[key] = _('Required in %(language)s.') % {'language': LANGUAGE_NAMES[code]}
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


def writable_fields(serializer_class):
    """Fields a nested child serializer writes, for config.api.sync_children."""
    return [name for name, field in serializer_class().fields.items() if name != 'id' and not field.read_only]


def languages_payload():
    """Language settings for the frontend."""
    from django.apps import apps

    fields = {}
    for model in apps.get_models():
        names = translated_fields(model)
        if names:
            fields[model._meta.db_table] = {name: is_required(model, name) for name in names}
    return {
        'language': translation.get_language(),
        'languages': [{'code': code, 'name': name} for code, name in settings.LANGUAGES],
        'default_language': settings.MODELTRANSLATION_DEFAULT_LANGUAGE,
        'required_languages': required_languages(),
        'translated_fields': fields,
    }
