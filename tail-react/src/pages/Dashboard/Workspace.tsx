import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Checkbox from "@/components/form/input/Checkbox";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function Workspace() {
  const { t } = useTranslation();
  const auth = useAuth();
  const projects = ["frontend", "backend", "design", "openSource"];
  const todos = ["review", "security", "dependencies", "performance", "ui"];
  const activities = ["created", "permission", "dictionary", "login"];
  const [completed, setCompleted] = useState<string[]>([]);
  return (
    <>
      <PageMeta
        title={`${t("workspace.greeting", { name: auth.user?.username || "" })} | ${t("app.name")}`}
        description={t("workspace.weather")}
      />
      <PageBreadCrumb
        pageTitle={t("workspace.greeting", { name: auth.user?.username || "" })}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 xl:col-span-2 dark:border-gray-800 dark:bg-white/3">
          <h2 className="mb-4 text-lg font-semibold">
            {t("workspace.projects")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <article
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                key={project}
              >
                <h3 className="font-medium text-gray-800 dark:text-white/90">
                  {t(`workspace.${project}`)}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {t("workspace.weather")}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
          <h2 className="mb-4 text-lg font-semibold">{t("workspace.todos")}</h2>
          <ul className="space-y-3">
            {todos.map((todo) => (
              <li className="flex items-start gap-3 text-sm" key={todo}>
                <div className="mt-1"><Checkbox checked={completed.includes(todo)} onChange={(checked) => setCompleted((current) => checked ? [...current, todo] : current.filter((item) => item !== todo))} /></div>
                <span>{t(`workspace.todoItems.${todo}`)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-6 xl:col-span-3 dark:border-gray-800 dark:bg-white/3">
          <h2 className="mb-4 text-lg font-semibold">
            {t("workspace.activity")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activities.map((activity, index) => (
              <div
                className="rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800"
                key={activity}
              >
                <p>{t(`workspace.activityItems.${activity}`)}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {t(`workspace.activityTimes.${index}`)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
