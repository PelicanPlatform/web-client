import {describe, expect, test} from '@jest/globals';

import SessionStorage from '../src/util/sessionObject';

describe("Testing sessionObject", () => {
	test("Create a session backed object", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: 2}});
		expect(obj).toBeDefined();
		expect(obj.a).toBe(1);
		expect(obj.b.c).toBe(2);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: 2}}));
	});

	test("Modify a property and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: 2}});
		obj.a = 3;
		expect(obj.a).toBe(3);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 3, b: {c: 2}}));
	});

	test("Modify a nested property and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: 2}});
		obj.b.c = 4;
		expect(obj.b.c).toBe(4);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: 4}}));
	});

	test("Add a new property and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: 2}});
		obj.d = 5;
		expect(obj.d).toBe(5);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: 2}, d: 5}));
	});

	test("Delete a property and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: 2}});
		delete obj.a;
		expect(obj.a).toBeUndefined();
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({b: {c: 2}}));
	});

	test("Add a value to a list and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: [2, 3]}});
		obj.b.c.push(4);
		expect(obj.b.c).toEqual([2, 3, 4]);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: [2, 3, 4]}}));
	});

	test("Delete a value from a list and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: [2, 3, 4]}});
		obj.b.c.splice(1, 1);
		expect(obj.b.c).toEqual([2, 4]);
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: [2, 4]}}));
	})

	test("Delete a value from a nested object and check session storage is updated", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {a: 1, b: {c: {d: 2, e: 3}}});
		delete obj.b.c.d;
		expect(obj.b.c.d).toBeUndefined();
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({a: 1, b: {c: {e: 3}}}));
	})

	test("Create a proxied object then set its value to a empty object", () => {
		sessionStorage.clear();
		let obj = SessionStorage<any>("testKey", {value: {a: 1, b: {c: 2}}});
		obj.value = {};
		expect(obj.value).toEqual({});
		expect(sessionStorage.getItem("testKey")).toBe(JSON.stringify({value: {}}));
	})
})