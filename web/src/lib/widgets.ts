import scriptSource from "@/widgets/scriptable-widget.js?raw";

export * from "../../../server/src/shared/widgets";

/** The Scriptable script with this app's address and the widget's own read-only key. */
export function buildWidgetScript(opts: { appUrl: string; token: string; name: string }): string {
  return scriptSource
    .replace('"__APP_URL__"', JSON.stringify(opts.appUrl.replace(/\/+$/, "")))
    .replace('"__WIDGET_TOKEN__"', JSON.stringify(opts.token))
    .replace('"__WIDGET_NAME__"', JSON.stringify(opts.name));
}
