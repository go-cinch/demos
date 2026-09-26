import { Link } from "react-router";
import { ArrowRightIcon } from "@/icons";
import { useTranslation } from "react-i18next";

interface BreadcrumbProps {
  pageTitle: string;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({ pageTitle }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2
        className="text-xl font-semibold text-gray-800 dark:text-white/90"
        x-text="pageName"
      >
        {pageTitle}
      </h2>
      <nav>
        <ol className="flex items-center gap-1.5">
          <li>
            <Link
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
              to="/"
            >
              {t("common.home")}
              <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-gray-400 rtl:rotate-180" />
            </Link>
          </li>
          <li className="text-sm text-gray-800 dark:text-white/90">
            {pageTitle}
          </li>
        </ol>
      </nav>
    </div>
  );
};

export default PageBreadcrumb;
