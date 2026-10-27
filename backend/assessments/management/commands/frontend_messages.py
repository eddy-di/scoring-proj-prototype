"""Collects the frontend's t('…') texts into locale/<lang>/LC_MESSAGES/djangojs.po.

The frontend (../frontend/js) writes every interface text in English inside
t('…'). This command adds new texts to the .po file of every language in
settings.LANGUAGES, drops texts that are no longer used, and compiles the .mo
files. Translate the texts in Rosetta (/rosetta/) or any .po editor.
"""
import re
from pathlib import Path

import polib
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# t('text' or t("text" – the first argument must be a plain string literal.
CALL = re.compile(r"""\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1""", re.S)
ESCAPES = {'n': '\n', 't': '\t', "'": "'", '"': '"', '\\': '\\'}


def unescape(text):
    return re.sub(r'\\(.)', lambda m: ESCAPES.get(m.group(1), m.group(1)), text)


def collect(root):
    """{text: ['js/views/x.js:12', …]} for every t('…') under root."""
    found = {}
    for path in sorted(root.rglob('*.js')):
        # Blank out // comment lines (keeping line numbers) so examples in comments aren't collected.
        source = re.sub(r'^[ \t]*//.*$', '', path.read_text(encoding='utf-8'), flags=re.M)
        for match in CALL.finditer(source):
            line = source.count('\n', 0, match.start()) + 1
            found.setdefault(unescape(match.group(2)), []).append(f'{path.relative_to(root.parent)}:{line}')
    return found


class Command(BaseCommand):
    help = "Collects the frontend's t('…') texts into djangojs.po for every language and compiles them."

    def add_arguments(self, parser):
        parser.add_argument('--check', action='store_true', help='Fail if any text is untranslated.')

    def handle(self, *args, check=False, **options):
        texts = collect(Path(settings.FRONTEND_DIR) / 'js')
        untranslated = {}
        for code, name in settings.LANGUAGES:
            if code == settings.LANGUAGE_CODE:
                continue
            path = Path(settings.LOCALE_PATHS[0]) / code / 'LC_MESSAGES' / 'djangojs.po'
            path.parent.mkdir(parents=True, exist_ok=True)
            po = polib.pofile(str(path)) if path.exists() else polib.POFile()
            po.metadata.update({
                'Project-Id-Version': 'qualimetry-frontend',
                'Language': code,
                'MIME-Version': '1.0',
                'Content-Type': 'text/plain; charset=UTF-8',
                'Content-Transfer-Encoding': '8bit',
            })
            existing = {entry.msgid: entry for entry in po}
            for text, places in texts.items():
                entry = existing.get(text)
                if entry is None:
                    entry = polib.POEntry(msgid=text, msgstr='')
                    po.append(entry)
                entry.occurrences = [tuple(p.rsplit(':', 1)) for p in places]
                entry.obsolete = False
            for msgid, entry in existing.items():
                if msgid not in texts:
                    po.remove(entry)
            po.sort(key=lambda e: e.msgid)
            po.save(str(path))
            po.save_as_mofile(str(path.with_suffix('.mo')))
            missing = [e.msgid for e in po if not e.msgstr]
            if missing:
                untranslated[code] = missing
            self.stdout.write(f'{name} ({code}): {len(po)} texts, {len(missing)} untranslated – {path}')
        if check and untranslated:
            raise CommandError('Untranslated frontend texts: ' + ', '.join(
                f'{code}: {len(items)}' for code, items in untranslated.items()))
