const memoryTitle = document.querySelector("#memory-title");

console.log(memoryTitle);

memoryTitle.addEventListener("change", function () {
    console.log(memoryTitle.value);
});

memoryTitle.addEventListener("change", function () {
    const customTitle = document.querySelector("#memory-custom-title");

    if (memoryTitle.value === "outro") {
        customTitle.style.display = "block";
        customTitle.focus();
    } else {
        customTitle.style.display = "none";
        customTitle.value= "";
    }
});