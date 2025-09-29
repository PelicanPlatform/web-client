import {ObjectList} from "./types";

/**
 * Parse a http header that is composed of key=value pairs separated by commas
 * @param header
 */
export function parseRecordHeader<T extends Record<string, string>>(header: string | null): any {

	// If header is null, return undefined
	if(header === null || header.trim() === ""){
		return undefined
	}

	// If the header is not in the expected format, log it and return undefined
	if(!header.includes("=")) {
		console.warn(`Header not in expected format: ${header}\n\tkey=value[, key=value...]]`)
		return undefined
	}

	return header.split(",").reduce((a, s) => {

			// Split the records in form key=value and add them to the object
			let [key, value] = s.split("=").map(x => x.trim())
			a[key] = value
			return a

	}, {} as Record<string, string>) as T
}

/**
 * Parse a link header into an array of objects with url and rel properties
 */
export function parseLinkHeader(header: string | null): {url: string, rel: string, pri: number, depth: number}[] | null {

	if(header === null){
		return []
	}

	// Split the header into individual links
	return header.split(",").map(link => {
		// Split each link into its URL and parameters
		const [urlPart, ...paramParts] = link.split(";").map(part => part.trim());

		// Extract the URL, removing angle brackets
		const url = urlPart.slice(1, -1);

		// Initialize rel, pri, and depth with default values
		let rel = "";
		let pri = 0;
		let depth = 0;

		// Process each parameter to extract rel, pri, and depth
		paramParts.forEach(param => {
			const [key, value] = param.split("=").map(part => part.trim());
			if (key === "rel") {
				rel = value.replace(/"/g, ""); // Remove quotes if present
			} else if (key === "pri") {
				pri = parseInt(value.replace(/"/g, ""), 10); // Convert to integer
			} else if (key === "depth") {
				depth = parseInt(value.replace(/"/g, ""), 10); // Convert to integer
			}
		});

		return { url, rel, pri, depth };
	});
}

export function parseOauthState(url: URL): Record<string, string> {

	const state = url.searchParams.get("state")

	if(state === null || state.trim() === ""){
		return {}
	}

	const stateParams = state.split(";").reduce((acc, param) => {
		const [key, value] = param.split(":")
		acc[key] = value
		return acc
	}, {} as Record<string, string>)

	return stateParams
}

/**
 * Parses a WebDAV XML multistatus response into a JSON array of resources.
 */
export function parseWebDavXmlToJson(xml: string): ObjectList[] {
  if (!xml || typeof xml !== 'string') return [];
  let doc: Document;
  try {
    // DOMParser is available in browser and some Node.js environments
    doc = new (window.DOMParser || (require('xmldom').DOMParser))().parseFromString(xml, 'application/xml');
  } catch (e) {
    // Fallback: return empty array if parsing fails
    return [];
  }
  const responses = Array.from(doc.getElementsByTagName('D:response'));
  return responses.map(resp => {
    const getText = (tag: string) => {
      const el = resp.getElementsByTagName(tag)[0];
      return el ? el.textContent || '' : '';
    };
    const href = getText('D:href');
    const getcontentlength = Number(getText('lp1:getcontentlength'));
    const getlastmodified = getText('lp1:getlastmodified');
    // Resource type: collection or empty string
    const resourcetypeEl = resp.getElementsByTagName('lp1:resourcetype')[0];
    let resourcetype = '';
    if (resourcetypeEl && resourcetypeEl.getElementsByTagName('D:collection').length > 0) {
      resourcetype = 'collection';
    }
    const iscollection = getText('lp1:iscollection') === '1';
    const executable = getText('lp1:executable');
    const status = getText('D:status');
    return {
      href,
      getcontentlength,
      getlastmodified,
      resourcetype,
      iscollection,
      executable,
      status
    };
  });
}
