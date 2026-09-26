import { HelmetProvider, Helmet } from "react-helmet-async";

const PageMeta = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  const brandedTitle = title.replace(
    /TailAdmin(?:\s*-\s*React\.js Admin Dashboard Template)?/gi,
    "Go Cinch Admin by TailAdmin",
  );
  return (
    <Helmet>
      <title>{brandedTitle}</title>
      <meta name="description" content={description} />
    </Helmet>
  );
};

export const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

export default PageMeta;
