const novelsSection = document.getElementById('novels-section');
const detailSection = document.getElementById('novel-detail-section');
const readerSection = document.getElementById('reader-section');
const readAllSection = document.getElementById('read-all-section');
const translateSection = document.getElementById('translate-section');

const allSections = [novelsSection, detailSection, readerSection, readAllSection, translateSection];

export function showOnly(section) {
  allSections.forEach((s) => {
    s.hidden = true;
  });
  section.hidden = false;
}

export function showListSections() {
  novelsSection.hidden = false;
  detailSection.hidden = true;
  readerSection.hidden = true;
  readAllSection.hidden = true;
  translateSection.hidden = true;
}

export { detailSection, readerSection, readAllSection, translateSection };
