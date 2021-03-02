/*****************************************************************************
Copyright (c) 2018-2021 - Maxprograms,  http://www.maxprograms.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of 
this software and associated documentation files (the "Software"), to compile, 
modify and use the Software in its executable form without restrictions.

Redistribution of this Software or parts of it in any form (source code or 
executable binaries) requires prior written permission from Maxprograms.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
SOFTWARE.
*****************************************************************************/

package com.maxprograms.tmxserver.excel;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.xml.parsers.ParserConfigurationException;

import com.maxprograms.tmxserver.utils.TextUtils;
import com.maxprograms.xml.Document;
import com.maxprograms.xml.Element;
import com.maxprograms.xml.SAXBuilder;
import com.maxprograms.xml.XMLOutputter;

import org.xml.sax.SAXException;

public class ExcelWriter {

    private Map<Integer, String> columnIndex;

    private SAXBuilder builder;

    public ExcelWriter() {
        builder = new SAXBuilder();
        buildColumnIndex();
    }

    private void buildColumnIndex() {
        columnIndex = new TreeMap<>();
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        int i = 0;
        for (; i < alphabet.length(); i++) {
            columnIndex.put(i, "" + alphabet.charAt(i));
        }
        for (int a = 0; a < alphabet.length(); a++) {
            for (int b = 0; b < alphabet.length(); b++) {
                columnIndex.put(i++, "" + alphabet.charAt(a) + alphabet.charAt(b));
            }
        }
    }

    public void writeFile(String fileName, Sheet sheet) throws IOException, SAXException, ParserConfigurationException {
        File folder = new File(new File(System.getProperty("java.io.tmpdir")), "ExcelWriter");
        if (folder.exists()) {
            ExcelReader.removeFolder(folder);
        }
        Files.createDirectories(folder.toPath());
        extractTemplate(folder);
        setSheetName(folder, sheet.getName());
        setStrings(folder, sheet);
        zipFolder(folder, fileName);
        ExcelReader.removeFolder(folder);
    }

    private void setSheetName(File folder, String name) throws SAXException, IOException, ParserConfigurationException {
        File workbook = new File(folder, "xl/workbook.xml");
        Document doc = builder.build(workbook);
        Element root = doc.getRootElement();
        Element sheets = root.getChild("sheets");
        Element sheet = sheets.getChild("sheet");
        sheet.setAttribute("name", name);
        try (FileOutputStream out = new FileOutputStream(workbook)) {
            XMLOutputter outputter = new XMLOutputter();
            outputter.output(doc, out);
        }
    }

    private void setStrings(File folder, Sheet sheet) throws SAXException, IOException, ParserConfigurationException {
        File sharedStrings = new File(folder, "xl/sharedStrings.xml");
        Document stringsDoc = builder.build(sharedStrings);
        Element sst = stringsDoc.getRootElement();
        sst.setContent(new ArrayList<>());

        File sheetXml = new File(folder, "xl/worksheets/sheet1.xml");
        Document sheetDoc = builder.build(sheetXml);
        Element sheetData = sheetDoc.getRootElement().getChild("sheetData");
        sheetData.setContent(new ArrayList<>());

        Set<String> unique = new TreeSet<>();
        Set<String> cols = sheet.getColumns();
        int rowsCount = sheet.rowsCount();
        int stringCount = 0;
        String spans = "1:" + cols.size();

        for (int i = 0; i < rowsCount; i++) {
            Element row = new Element("row");
            row.setAttribute("r", "" + (i + 1));
            row.setAttribute("spans", spans);
            Map<String, String> map = sheet.getRow(i);
            Iterator<String> it = cols.iterator();
            int colCount = 0;
            while (it.hasNext()) {
                String column = it.next();
                String cell = map.get(column);
                if (cell != null && !cell.isEmpty()) {
                    Element c = new Element("c");
                    c.setAttribute("r", columnIndex.get(colCount) + (i + 1));
                    Element si = new Element("si");
                    Element t = new Element("t");
                    t.addContent(TextUtils.cleanString(cell));
                    si.addContent(t);
                    sst.addContent(si);

                    c.setAttribute("t", "s");
                    if (cell.indexOf("\n") != -1) {
                        c.setAttribute("s", "1");
                        t.setAttribute("xml:space", "preserve");
                    }
                    Element v = new Element("v");
                    v.addContent("" + stringCount);
                    c.addContent(v);

                    unique.add(cell);
                    stringCount++;
                    row.addContent(c);
                }
                colCount++;
            }
            sheetData.addContent(row);
        }
        sst.setAttribute("count", "" + stringCount);
        sst.setAttribute("uniqueCount", "" + unique.size());

        try (FileOutputStream out = new FileOutputStream(sharedStrings)) {
            XMLOutputter outputter = new XMLOutputter();
            outputter.output(stringsDoc, out);
        }
        try (FileOutputStream out = new FileOutputStream(sheetXml)) {
            XMLOutputter outputter = new XMLOutputter();
            outputter.output(sheetDoc, out);
        }
    }

    private void extractTemplate(File folder) throws IOException {
        try (ZipInputStream in = new ZipInputStream(ExcelWriter.class.getResourceAsStream("template.xlsx"))) {
            ZipEntry entry = null;
            while ((entry = in.getNextEntry()) != null) {
                File tmp = new File(folder, entry.getName());
                if (!tmp.getParentFile().exists()) {
                    Files.createDirectories(tmp.getParentFile().toPath());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(tmp.toPath());
                } else {
                    try (FileOutputStream output = new FileOutputStream(tmp.getAbsolutePath())) {
                        byte[] buf = new byte[1024];
                        int len;
                        while ((len = in.read(buf)) != -1) {
                            output.write(buf, 0, len);
                        }
                    }
                }
            }
        }
    }

    public void zipFolder(File sourceFolder, String fileName) throws IOException {
        try (FileOutputStream fileOutput = new FileOutputStream(fileName)) {
            try (ZipOutputStream zipOutput = new ZipOutputStream(fileOutput)) {
                Path sourcePath = sourceFolder.toPath();
                Files.walkFileTree(sourcePath, new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult preVisitDirectory(final Path dir, final BasicFileAttributes attrs)
                            throws IOException {
                        if (!sourcePath.equals(dir)) {
                            zipOutput.putNextEntry(new ZipEntry(sourcePath.relativize(dir).toString() + "/"));
                            zipOutput.closeEntry();
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(final Path file, final BasicFileAttributes attrs)
                            throws IOException {
                        zipOutput.putNextEntry(new ZipEntry(sourcePath.relativize(file).toString()));
                        Files.copy(file, zipOutput);
                        zipOutput.closeEntry();
                        return FileVisitResult.CONTINUE;
                    }
                });
            }
        }
    }
}