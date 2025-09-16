import {describe, expect, test} from '@jest/globals';

import Client, * as ClientFunctions from "../src/Client"

describe("Testing Client", () => {
	let fetchMock: any = undefined;

	test("Discovery URL is a 404 and returns an error", async () => {

		fetchMock = jest.spyOn(global, "fetch")
				.mockImplementationOnce(async () => {
					return {
						ok: true,
						status: 404,
						json: async () => {}
					} as Response
				})

		let client = new Client("https://example.com")

		await expect(client.getMetadata())
				.rejects
				.toThrow("Metadata endpoint returned 404: https://example.com/.well-known/pelican-configuration")
	})

	test("Discovery URL is not a valid JSON file", async () => {

		fetchMock = jest.spyOn(global, "fetch")
				.mockImplementationOnce(async () => {
					return {
						ok: true,
						status: 200,
						json: async () : Promise<unknown> => {throw new Error()}
					} as Response
				})

		let client = new Client("https://example.com")

		await expect(client.getMetadata())
				.rejects
				.toThrow("Metadata endpoint returned invalid JSON: https://example.com/.well-known/pelican-configuration")
	})

	test("Try to download with incomplete metadata", async () => {

		const getMetadataMock = jest.spyOn(Client.prototype, "getMetadata")
			.mockImplementation(async () : Promise<any> => {
				return {
					not_director_endpoint: "https://example.com"
				}
			})

		let client = new Client("https://example.com")

		await expect(client.getObject("/test.txt"))
				.rejects
				.toThrow("Metadata does not contain director_endpoint")
	})

	test("Get and download a file", async () => {

		let testFileContent = "test"
		let testFileName = "test.txt"
		let testFilePath = `/${testFileName}`

		window.URL.createObjectURL = jest.fn(() => "blobUrl")

		const downloadUrlMock = jest.spyOn(ClientFunctions, "downloadUrl")
				.mockImplementationOnce(async () => {})

		const getMetadataMock = jest.spyOn(Client.prototype, "getMetadata")
				.mockImplementationOnce(async () : Promise<any> => {
					return {
						director_endpoint: "https://example.com"
					}
				})

		// Mock the file request
		fetchMock = jest.spyOn(global, "fetch")
				.mockImplementationOnce(async () => {
					return {
						ok: true,
						status: 200,
						blob: async () : Promise<Blob> => {
							return new Blob([testFileContent], {type : 'text/plain'});
						}
					} as Response
				})

		// Mock the download
		let client = new Client("https://example.com")
		await client.getObject(testFilePath)
		expect(downloadUrlMock).toHaveBeenCalledWith("https://example.com" + testFilePath)
	})

	test("Download file creates an a tag with the blob url and clicks it", async () => {

		const testBlobUrl = "blobUrl"
		const testFileName = "test.txt"

		const mLink = { href: '', click: jest.fn(), download: '', style: { display: '' }, setAttribute: jest.fn() } as any;
		const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(mLink);
		document.body.appendChild = jest.fn();
		document.body.removeChild = jest.fn();

		ClientFunctions.downloadUrl(testBlobUrl, testFileName)

		expect(createElementSpy).toBeCalledWith('a');
		expect(mLink.setAttribute.mock.calls.length).toBe(3);
		expect(mLink.setAttribute.mock.calls[0]).toEqual(['href', testBlobUrl]);
		expect(mLink.setAttribute.mock.calls[1]).toEqual(['download', testFileName]);
		expect(mLink.style.display).toBe('none');
		expect(mLink.click).toBeCalled();
	})

	test("Download file a tag sets a default download value of ''", async () => {

		const testBlobUrl = "blobUrl"

		const mLink = { href: '', click: jest.fn(), download: '', style: { display: '' }, setAttribute: jest.fn() } as any;
		const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(mLink);
		document.body.appendChild = jest.fn();
		document.body.removeChild = jest.fn();

		ClientFunctions.downloadUrl(testBlobUrl)

		expect(createElementSpy).toBeCalledWith('a');
		expect(mLink.setAttribute.mock.calls.length).toBe(3);
		expect(mLink.setAttribute.mock.calls[0]).toEqual(['href', testBlobUrl]);
		expect(mLink.setAttribute.mock.calls[1]).toEqual(['download', '']);
		expect(mLink.style.display).toBe('none');
		expect(mLink.click).toBeCalled();
	})
})

describe("Testing ClientFunctions", () => {
	test("Download a Authenticated File", async () => {
		const client = new Client("https://127.0.0.1:80")
		await client.getObject("/mnt/test.txt")
	})
})