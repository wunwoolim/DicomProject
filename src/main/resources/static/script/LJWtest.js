let stack = {
    currentImageIdIndex: 0,
    imageIds: [],
};

//도구 기능들 시작
cornerstoneTools.init();

function createParentDiv(){
    for(let i = 0; i<25;i++){
        const parentDiv = document.createElement('div');
        parentDiv.classList.add('parentDiv');
        if(i>4){
            parentDiv.classList.add('displayNone');
        }
        parentDiv.id = "parentDiv"+i;
        parentDiv.setAttribute('data-value',i);
        document.getElementById('dicomImageContainer').appendChild(parentDiv);
    }
}

async function overlayAiPresent(prContent, i) {
    if (prContent != null && prContent.TextObjectSequence) {
        const viewportElement = document.querySelector(`#viewport${i}`);
        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = 512;
        overlayCanvas.height = 512;
        const overlayCtx = overlayCanvas.getContext('2d');

        if (prContent.TextObjectSequence.length > 0) {
            prContent.TextObjectSequence.forEach(function (textObject) {
                overlayCtx.fillStyle = 'white';
                overlayCtx.font = '16px Arial';
                overlayCtx.textAlign = 'center';

                var x = (textObject.BoundingBoxBottomRightHandCorner.Column + textObject.BoundingBoxTopLeftHandCorner.Column) / 2;
                var y = (textObject.BoundingBoxBottomRightHandCorner.Row + textObject.BoundingBoxTopLeftHandCorner.Row) / 2;
                var text = textObject.UnformattedTextValue;

                overlayCtx.fillText(text, x, y);
            });
        }

        viewportElement.appendChild(overlayCanvas);
    }
}



async function displayDicomImage(i,dicomFile) {
        const blobUrl = dicomFile.replace('dicomweb:', '');

        fetch(blobUrl)
            .then(response => response.blob())
            .then(blob => {

                const reader = new FileReader();
                reader.onload = function (event) {
                    const arrayBuffer = event.target.result;

                    const byteArray = new Uint8Array(arrayBuffer);
                    const dataSet = dicomParser.parseDicom(byteArray);

                    // 데이터가 준비되면 처리 코드를 여기에 이동
                    const viewportElement = document.createElement('div');
                    viewportElement.classList.add('CSViewport');
                    viewportElement.id =`viewport${i}`;

                    const topLeft = document.createElement('div');
                    topLeft.classList.add('topLeft');

                    topLeft.innerHTML = `
                    <span>${dataSet.string('x00100020')}</span>
                    <span>${dataSet.string('x00100010')}</span>
                    <span>${dataSet.string('x00100030')}</span>
                    <span>${dataSet.string('x00200011')}</span>
                    <span class="imageNumber">${dataSet.string('x00200013')}</span>
                    <span>${dataSet.string('x00080020')}</span>
                    <span>${dataSet.string('x00080030')}</span>
                `;

                    const topRight = document.createElement('div');
                    topRight.classList.add('topRight');
                    topRight.innerHTML = `
                    <span>${dataSet.string('x00080070')}</span>
                    <span>${dataSet.string('x00081090')}</span>
                `;

                    const bottomRight = document.createElement('div');
                    //<span>${dataSet.string('x00280010')} / ${dataSet.string('x00280011')}</span>
                    bottomRight.classList.add('bottomRight');
                    bottomRight.innerHTML = `
                    <span>${Math.floor(dataSet.string('x00281051'))} / ${Math.floor(dataSet.string('x00281050'))}</span>
                    <span>${dataSet.string('x00321032')}</span>
                `;
                    const parentDiv = document.getElementById("parentDiv"+i)
                    viewportElement.appendChild(topLeft);
                    viewportElement.appendChild(topRight);
                    viewportElement.appendChild(bottomRight);
                    parentDiv.appendChild(viewportElement);

                    document.getElementById('dicomImageContainer').appendChild(parentDiv);

                    cornerstone.enable(viewportElement);

                    cornerstone.loadImage(dicomFile).then(image => {
                        cornerstone.displayImage(viewportElement, image);
                    });

                    // 마우스 휠 이벤트를 사용하여 다음 또는 이전 이미지로 전환
                    viewportElement.addEventListener('wheel', function (event) {
                        cornerstoneTools.addStackStateManager(viewportElement, ['stack']);
                        cornerstoneTools.addToolState(viewportElement, 'stack', stack);

                        if (event.deltaY > 0) {
                            stackScrollDown(viewportElement);
                        } else {
                            stackScrollUp(viewportElement);
                        }

                        event.preventDefault();
                    });
                };
                reader.readAsArrayBuffer(blob);
            })
            .catch(error => console.error(error));

    }


async function viewDicom() {
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

    try {
        let seriesTabList = await getSeriesTab();

        for (let i = 0; i < seriesTabList.length; i++) {
                let item = seriesTabList[i];
                let directoryPath = await getImagePath(item.studykey, item.seriesinsuid);
                function extractNumber(path) {
                    const match = path.match(/\.(\d+)\.\d+\.dcm$/);
                    return match ? parseInt(match[1]) : null;
                }

                directoryPath.sort((a, b) => {
                    const numberA = extractNumber(a);
                    const numberB = extractNumber(b);

                    // 숫자가 있는 경우에만 비교
                    if (numberA !== null && numberB !== null) {
                        return numberA - numberB;
                    }

                    // 숫자가 없는 경우 문자열로 비교
                    return a.localeCompare(b);
                });

                stack[i] = {
                    currentImageIdIndex: 0,
                    imageIds: [directoryPath],
                };

                let dicomFile = await getDicomFile(i);
                console.log(i)
                await displayDicomImage(i,seriesTabList.length,dicomFile);
                            if (i < cont && stack[i].imageIds.length > 0) {
                await displayDicomImage(i);
                await overlayAiPresent(i);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

    //dcm 파일을 바이트 배열로 변환
    async function getDicomFile(i){

        let response = await axios.get("/getDicomFile", {
            params: {
                directoryPath: decodeURIComponent(stack[i].imageIds[0][stack.currentImageIdIndex])
            },
            responseType: 'arraybuffer'
        });

        if (response.status === 200) {
            arrayBuffer = response.data;
            return `dicomweb:${URL.createObjectURL(new Blob([arrayBuffer], {type: 'application/dicom'}))}`;
        }

    }

    async function getSeriesTab() {

        try {
            const pathArray = window.location.pathname.split('/');
            const studykey = pathArray[2];
            // const studykey =2 ;

            let response = await axios.get("/v1/storage/search/PacsSeriestab", {
                params: {
                    studykey: studykey
                }
            });

            if (response.status === 200) {
                return response.data;
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function getImagePath(studykey, seriesinsuid) {
        try {
            let response = await axios.get("/getImagePath", {
                params: {
                    studykey: studykey,
                    seriesinsuid: seriesinsuid
                }
            });

            if (response.status === 200) {
                return response.data;
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function getPRContentList(studykey, serieskey, imagecnt) {
        try {
            let response = await axios.get("/getPRContentList", {
                params: {
                    studykey: studykey,
                    serieskey: serieskey,
                    imagecnt: imagecnt
                }
            });

            if (response.status === 200) {
                if (response.data != null) {
                    return response.data;
                } else {
                    return [];
                }
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
    }

function stackScrollDown(element) {
    const stackToolData = cornerstoneTools.getToolState(element, 'stack');

    if (stackToolData && stackToolData.data.length > 0) {
        const stackData = stackToolData.data[0];
        let firstCharacter;
        const mouseOverElement = document.elementFromPoint(event.pageX, event.pageY);
        const csViewportParent = mouseOverElement.closest('.CSViewport');

        if (csViewportParent) {
            const id = csViewportParent.id;
            if (id.length > 0) {
                firstCharacter = id.charAt(id.length - 1);
            }
        }

        if (stackData.currentImageIdIndex >= 0 && stackData.currentImageIdIndex < stackData[firstCharacter].imageIds[0].length - 1) {
            stackData.currentImageIdIndex++;
            stackUpDown(element,firstCharacter,csViewportParent);
        }
    }
}


function stackScrollUp(element) {
        const stackToolData = cornerstoneTools.getToolState(element, 'stack');

        if (stackToolData && stackToolData.data.length > 0) {
            const stackData = stackToolData.data[0];
            let firstCharacter;
            const mouseOverElement = document.elementFromPoint(event.pageX, event.pageY);
            const csViewportParent = mouseOverElement.closest('.CSViewport');

            if (csViewportParent) {
                const id = csViewportParent.id;
                if (id.length > 0) {
                    firstCharacter = id.charAt(id.length - 1);
                }
            }

            if (stackData.currentImageIdIndex > 0) {
                stackData.currentImageIdIndex--;
                stackUpDown(element,firstCharacter,csViewportParent);
            }
        }
    }

function stackUpDown(element,firstCharacter,csViewportParent){
    let dicomFile = getDicomFile(firstCharacter);

    let blobUrl;
    dicomFile.then(dicomUrl => {
        blobUrl = dicomUrl.replace('dicomweb:', '');

        fetch(blobUrl)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onload = function (event) {
                    const arrayBuffer = event.target.result;

                    const byteArray = new Uint8Array(arrayBuffer);
                    const dataSet = dicomParser.parseDicom(byteArray);

                    const indexSpan = csViewportParent.querySelector('.imageNumber');

                    // x00200013 값으로 이미지 번호 업데이트
                    const imageNumberValue = dataSet.string('x00200013');
                    if (indexSpan) {
                        indexSpan.textContent = imageNumberValue;
                    }

                    //const nextImageId = stack[firstCharacter].imageIds[stackData.currentImageIdIndex];
                    cornerstone.loadImage(dicomUrl).then(image => {
                        cornerstone.displayImage(element, image);
                        overlayAiPresent(firstCharacter);
                    });
                };
                reader.readAsArrayBuffer(blob);
            })
            .catch(error => console.error(error));
    })
}




//레이 아웃 틀 만들기
let isTogleBoxVisible = false;
const button = document.getElementById('toggleButton');

function togleBox() {
    const button = document.getElementById('toggleButton');

    if (isTogleBoxVisible) {
        const togleBox = document.getElementById('togleBox');
        if (togleBox) {
            button.removeChild(togleBox);
        }
    } else {
        const togleBox = document.createElement('div');
        togleBox.classList.add('togleBox');
        togleBox.id = 'togleBox';

        for (let i = 0; i < 5; i++) {
            const togleDiv = document.createElement('div');

            for (let j = 0; j < 5; j++) {
                const vertical = document.createElement('div');
                vertical.classList.add('vertical-align');

                const table = document.createElement('div');
                table.classList.add('table');
                table.id = 'table';
                table.setAttribute("data-row", i + 1);
                table.setAttribute("data-column", j + 1);

                table.addEventListener('click', function(event) {
                    const clickedRow = event.currentTarget.getAttribute('data-row');
                    const clickedColumn = event.currentTarget.getAttribute('data-column');

                    gridLayout(clickedRow, clickedColumn);
                });

                table.addEventListener('mouseover', function(event) {
                    const hoveredRow = parseInt(event.currentTarget.getAttribute('data-row'));
                    const hoveredColumn = parseInt(event.currentTarget.getAttribute('data-column'));

                    applyBackgroundColor(hoveredRow, hoveredColumn);
                });

                table.addEventListener('mouseout', function(event) {
                    resetBackgroundColor();
                });

                vertical.appendChild(table);
                togleDiv.appendChild(vertical);
            }
            togleBox.appendChild(togleDiv);
        }

        button.appendChild(togleBox);
    }

    isTogleBoxVisible = !isTogleBoxVisible;
}

button.addEventListener('click', togleBox);

//마우스 위치에 따른 레이아웃 색상 변경
function applyBackgroundColor(row, column) {
    const allDivs = document.querySelectorAll('.table');

    allDivs.forEach(div => {
        const divRow = parseInt(div.getAttribute('data-row'));
        const divColumn = parseInt(div.getAttribute('data-column'));

        if (divRow <= row && divColumn <= column) {
            div.style.backgroundColor = 'rgb(204, 204, 204)';
        }
    });
}

//마우스 위치에 따른 레이아웃 색상 초기화
function resetBackgroundColor() {
    const allDivs = document.querySelectorAll('.table');

    allDivs.forEach(div => {
        div.style.backgroundColor = '';
    });
}
//선택한 레이아웃 외 parentDiv none
function hideDicomImage(index) {
    const parentDivs = document.getElementsByClassName('parentDiv');
    const parentDiv = parentDivs[index];
    parentDiv.style.display = 'none';

}
//선택한 레이아웃 만큰 parentDiv block
function showDicomImage(index) {
    const parentDivs = document.getElementsByClassName('parentDiv');
    const parentDiv = parentDivs[index];
    parentDiv.style.display = 'block';
}

//레이아웃 선택시 그리드 크기 설정
function gridLayout(row, column) {
    const wadoBox = document.getElementById('dicomImageContainer');
    wadoBox.style.gridTemplateRows = `repeat(${row},1fr)`;
    wadoBox.style.gridTemplateColumns = `repeat(${column},1fr)`;

    const parentDivs = document.getElementsByClassName('parentDiv');
    for (let i = 0; i < parentDivs.length; i++) {
        const parentDiv = parentDivs[i];
        const dataValue = parentDiv.getAttribute('data-value');

        if (dataValue) {
            const value = parseInt(dataValue);
            if (value < row * column) {
                showDicomImage(i);
            } else {
                hideDicomImage(i);
            }
        }
    }

    const allViewports = document.querySelectorAll('.CSViewport');
    allViewports.forEach(viewport => {
        cornerstone.resize(viewport);
    });
}

createParentDiv();
viewDicom();