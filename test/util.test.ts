import { describe, expect, test } from "@jest/globals";
import { parseHeader, parseLinkHeader } from "../src/util";

describe("parseHeader", () => {
    test("parses simple header with key-value pairs", () => {
        const header = "key1=value1, key2=value2";
        const result = parseHeader(header);
        expect(result).toEqual({ key1: "value1", key2: "value2" });
    });

    test("handles spaces and missing values", () => {
        const header = "key1=value1, key2=, key3=value3";
        const result = parseHeader(header);
        expect(result).toEqual({ key1: "value1", key2: "", key3: "value3" });
    });

    test("returns empty string if header is null", () => {
        expect(parseHeader(null)).toEqual("");
    });

    test("parses quoted values", () => {
        const header = 'key1="value1"; key2="value2"';
        const result = parseHeader(header);
        expect(result).toEqual({ key1: "value1", key2: "value2" });
    });
});

describe("parseLinkHeader", () => {
    test("parses single link", () => {
        const header = '<https://api.example.com/page2>; rel="next"';
        const result = parseLinkHeader(header);
        expect(result).toEqual({
            next: "https://api.example.com/page2",
        });
    });

    test("parses multiple links", () => {
        const header = '<https://api.example.com/page2>; rel="next", <https://api.example.com/page1>; rel="prev"';
        const result = parseLinkHeader(header);
        expect(result).toEqual({
            next: "https://api.example.com/page2",
            prev: "https://api.example.com/page1",
        });
    });

    test("returns empty object for empty string", () => {
        expect(parseLinkHeader("")).toEqual({});
    });

    test("ignores links without rel", () => {
        const header = '<https://api.example.com/page2>; title="Page 2"';
        const result = parseLinkHeader(header);
        expect(result).toEqual({});
    });
});
