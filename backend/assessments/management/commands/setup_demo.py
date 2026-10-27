from django.core.management.base import BaseCommand

from config.demo import DEMO_USERS, ensure_demo_users, reset_demo_data


class Command(BaseCommand):
    help = 'Replaces all domain data with the example fixtures and creates the demo users.'

    def handle(self, *args, **options):
        reset_demo_data()
        created = ensure_demo_users()
        self.stdout.write(self.style.SUCCESS('Example data loaded.'))
        for username, password, role, what in DEMO_USERS:
            note = 'created' if username in created else 'already existed, password unchanged'
            self.stdout.write(f'  {username} / {password}  ({role or "no role"}: {what}; {note})')
