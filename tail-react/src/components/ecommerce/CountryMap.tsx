import VectorMap from "@/components/common/VectorMap";
import { useTranslation } from "react-i18next";

export default function CountryMap() {
  const { t } = useTranslation();
  return (
    <VectorMap
      map="world"
      backgroundColor="transparent"
      markerStyle={{
        initial: {
          fill: "#465FFF",
          r: 4,
        },
      }}
      markersSelectable={true}
      markers={[
        {
          coords: [37.2580397, -104.657039],
          name: t("ecommerce.countries.unitedStates"),
          style: {
            fill: "#465FFF",
            strokeWidth: 1,
            stroke: "#383f47",
          },
        },
        {
          coords: [20.7504374, 73.7276105],
          name: t("ecommerce.countries.india"),
          style: { fill: "#465FFF", strokeWidth: 1, stroke: "white" },
        },
        {
          coords: [53.613, -11.6368],
          name: t("ecommerce.countries.unitedKingdom"),
          style: { fill: "#465FFF", strokeWidth: 1, stroke: "white" },
        },
        {
          coords: [-25.0304388, 115.2092761],
          name: t("ecommerce.countries.sweden"),
          style: {
            fill: "#465FFF",
            strokeWidth: 1,
            stroke: "white",
            strokeOpacity: 0,
          },
        },
      ]}
      zoomButtons={false}
      zoomOnScroll={false}
      zoomMax={12}
      zoomMin={1}
      zoomAnimate={true}
      zoomStep={1.5}
      regionStyle={{
        initial: {
          fill: "#D0D5DD",
          fillOpacity: 1,
          fontFamily: "Outfit",
          stroke: "none",
          strokeWidth: 0,
          strokeOpacity: 0,
        },
        hover: {
          fillOpacity: 0.7,
          cursor: "pointer",
          fill: "#465fff",
          stroke: "none",
        },
        selected: {
          fill: "#465FFF",
        },
        selectedHover: {},
      }}
      regionLabelStyle={{
        initial: {
          fill: "#35373e",
          fontWeight: 500,
          fontSize: "13px",
          stroke: "none",
        },
        hover: {},
        selected: {},
        selectedHover: {},
      }}
    />
  );
}
