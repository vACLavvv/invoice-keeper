#!/bin/sh
set -eu
ROOT=/opt/invoice-keeper
compose() {
    docker compose --project-name invoice-keeper-prod --env-file "$ROOT/config/deploy.env" -f "$ROOT/current/source/deploy/compose.prod.yaml" "$@"
}
case "${1:-status}" in
    status) compose ps ;;
    logs) compose logs --tail 100 keeper ;;
    restart) compose restart keeper ;;
    stop) compose stop keeper ;;
    start) compose up -d --no-build --pull never keeper ;;
    backup) systemctl start invoice-keeper-backup.service ;;
    timers) systemctl list-timers 'invoice-keeper-*' --no-pager ;;
    *) echo 'Usage: keeper.sh {status|logs|restart|stop|start|backup|timers}' >&2; exit 2 ;;
esac
