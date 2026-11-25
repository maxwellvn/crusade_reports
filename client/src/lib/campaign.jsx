import * as React from "react";
import { getJSON } from "@/lib/api";

const NOTC = {
  id: "notc",
  short_name: "NOTC",
  name: "A Night of a Thousand Crusades",
  host: "notc.rhapsodycrusades.org",
  event_date_range: null,
  campaigns: [],
};

const AAC = {
  id: "aac",
  short_name: "Angels at Christmas",
  name: "Angels at Christmas Celebration Crusades",
  host: "aac.rhapsodycrusades.org",
  event_date_range: { from: "2026-12-01", to: "2026-12-31" },
  campaigns: [],
};

const campaignFromBrowserHost = () => (
  typeof window !== "undefined" && /(^|\.)aac(?:\.|$)/i.test(window.location.hostname) ? AAC : NOTC
);

const CampaignContext = React.createContext(NOTC);

export function CampaignProvider({ children }) {
  const [campaign, setCampaign] = React.useState(campaignFromBrowserHost);

  React.useEffect(() => {
    let active = true;
    getJSON("/campaign-settings?include_campaign=1")
      .then((settings) => { if (active && settings?.campaign) setCampaign(settings.campaign); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.campaign = campaign.id;
    return () => { delete document.documentElement.dataset.campaign; };
  }, [campaign.id]);

  return <CampaignContext.Provider value={campaign}>{children}</CampaignContext.Provider>;
}

export const useCampaign = () => React.useContext(CampaignContext);
export const isAacCampaign = (campaign) => campaign?.id === "aac";

export function campaignDateProps(campaign) {
  return campaign?.event_date_range
    ? { min: campaign.event_date_range.from, max: campaign.event_date_range.to }
    : {};
}
