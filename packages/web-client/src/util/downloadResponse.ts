function downloadResponse(response: Response) {
    response.blob().then((blob) => {
        let url = window.URL.createObjectURL(blob);
        downloadUrl(response.url?.split("/")?.at(-1)?.split("?")?.at(0), url);
    });
}

function downloadUrl(objectName: string = "object", url: string) {
    let a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", objectName);
    a.style.display = "none";
    a.click();
    window.URL.revokeObjectURL(url);
}

export default downloadResponse;
