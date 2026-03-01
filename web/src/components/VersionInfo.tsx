import type { ReleaseInfo } from "../utils/github";
import { Version } from "../utils/version";

interface Props {
    currentVersion: Version | undefined;
    latestVersionInfo: ReleaseInfo | undefined;
}

export default function VersionInfo({ currentVersion, latestVersionInfo }: Props) {
    let latestVersion: Version | undefined = undefined;
    let relInfoUrl: string = '';
    if (latestVersionInfo) {
        relInfoUrl = latestVersionInfo.html_url;
        try {
            latestVersion = Version.parse(latestVersionInfo.tag_name);
        } catch (err: any) {
            console.log(`failed to parse latest version from '${latestVersionInfo.tag_name}'. err: `, err);
        }
    }

    let summaryText: string = '';
    let summaryColor: string = '';
    let newReleaseAvail: boolean = false;
    if (currentVersion && latestVersion) {
        if (latestVersion.isGreaterThan(currentVersion)) {
            summaryText = ` - new version available: ${latestVersion.toString()}`;
            summaryColor = 'orange';
            newReleaseAvail = true;
        } else if (latestVersion.equals(currentVersion)) {
            summaryText = ' - latest';
            summaryColor = 'green';
        }
    }
    let currVerStr = 'UNKNOWN';
    if (currentVersion) {
        currVerStr = currentVersion.toString();
    }

    const updateNowClicked = () => {
        console.log(latestVersionInfo);
    };

    return (
        <span>
            {currVerStr}
            <span hidden={summaryText.length == 0}>
                <span style={{color: summaryColor}}>{summaryText}</span>
                <span hidden={ ! newReleaseAvail}> (<a href={relInfoUrl} target="_blank">See Release Info</a> | <a href="#" onClick={updateNowClicked}>Update Now</a>)</span>
            </span>
        </span>
    );
}