/*****************************************************************************
Copyright (c) 2018-2020 - Maxprograms,  http://www.maxprograms.com/

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
package com.maxprograms.tmxserver;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.xml.parsers.ParserConfigurationException;

import com.maxprograms.languages.RegistryParser;
import com.maxprograms.tmxserver.models.Language;
import com.maxprograms.tmxserver.models.TUnit;
import com.maxprograms.tmxserver.tmx.CountStore;
import com.maxprograms.tmxserver.tmx.H2Store;
import com.maxprograms.tmxserver.tmx.LanguagesStore;
import com.maxprograms.tmxserver.tmx.MergeStore;
import com.maxprograms.tmxserver.tmx.SimpleStore;
import com.maxprograms.tmxserver.tmx.SplitStore;
import com.maxprograms.tmxserver.tmx.StoreInterface;
import com.maxprograms.tmxserver.tmx.TMXCleaner;
import com.maxprograms.tmxserver.tmx.TMXConverter;
import com.maxprograms.tmxserver.tmx.TMXReader;
import com.maxprograms.tmxserver.tmx.TmxUtils;
import com.maxprograms.tmxserver.utils.LangUtils;
import com.maxprograms.tmxserver.utils.TextUtils;
import com.maxprograms.tmxvalidation.TMXValidator;
import com.maxprograms.xml.Attribute;
import com.maxprograms.xml.Document;
import com.maxprograms.xml.Element;
import com.maxprograms.xml.Indenter;
import com.maxprograms.xml.XMLOutputter;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xml.sax.SAXException;

public class TMXService implements TMXServiceInterface {

	protected static final Logger LOGGER = Logger.getLogger(TMXService.class.getName());
	protected static final String FILE_SEPARATOR = System.getProperty("file.separator");

	protected StoreInterface store;
	protected File currentFile;
	private RegistryParser registry;
	protected int indentation;

	protected boolean parsing;
	protected String parsingError;

	protected boolean processing;
	protected String processingError;

	protected boolean saving;
	protected String savingError;

	protected boolean splitting;
	protected String splitError;

	protected boolean merging;
	protected String mergeError;

	protected boolean cleaning;
	protected String cleaningError;

	protected boolean exporting;
	protected String exportingError;

	protected boolean validating;
	protected String validatingError;

	protected CountStore countStore;
	protected SplitStore splitStore;
	protected MergeStore mergeStore;

	public boolean isOpen() {
		return store != null;
	}

	private static File getPreferencesFolder() {
		String os = System.getProperty("os.name").toLowerCase();
		if (os.startsWith("mac")) {
			return new File(System.getProperty("user.home") + "/Library/Application Support/TMXEditor/");
		}
		if (os.startsWith("windows")) {
			return new File(System.getenv("AppData") + "\\TMXEditor\\");
		}
		return new File(System.getProperty("user.home") + "/.tmxeditor/");
	}

	private static void removeFile(File f) throws IOException {
		if (f.isDirectory()) {
			File[] list = f.listFiles();
			for (int i = 0; i < list.length; i++) {
				removeFile(list[i]);
			}
		}
		Files.delete(f.toPath());
	}

	@Override
	public JSONObject openFile(String fileName) {
		JSONObject result = new JSONObject();
		try {
			parsing = true;
			File home = getPreferencesFolder();
			if (!home.exists()) {
				Files.createDirectory(home.toPath());
			}
			File tmp = new File(home, "tmp");
			if (tmp.exists()) {
				removeFile(tmp);
			}
			Files.createDirectory(tmp.toPath());
			if (store != null) {
				store.close();
				store = null;
			}
			currentFile = new File(fileName);
			store = new SimpleStore();
			long size = currentFile.length();
			if (size > 100l * 1024 * 1024) {
				LanguagesStore langStore = new LanguagesStore();
				TMXReader reader = new TMXReader(langStore);				
				reader.parse(currentFile);
				Set<String> languages = langStore.getLanguages();
				store = new H2Store(languages);
			} else {
				store = new SimpleStore();
			}
			parsingError = "";
			Thread thread = new Thread() {
				@Override
				public void run() {
					try {
						TMXReader reader = new TMXReader(store);
						reader.parse(currentFile);
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						parsingError = e.getMessage();
						try {
							store.close();
						} catch (Exception e1) {
							// do nothing
						}
						store = null;
					}
					parsing = false;
				}
			};
			thread.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			parsing = false;
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, ex.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject getData(int start, int count, String filterText, Language filterLanguage,
			boolean caseSensitiveFilter, boolean filterUntranslated, boolean regExp, Language filterSrcLanguage,
			Language sortLanguage, boolean ascending) {
		processing = true;
		processingError = "";
		JSONObject result = new JSONObject();
		try {
			List<TUnit>  data = store.getUnits(start, count, filterText, filterLanguage, caseSensitiveFilter, filterUntranslated,
					regExp, filterSrcLanguage, sortLanguage, ascending);
			JSONArray array = new JSONArray();
			Iterator<TUnit> it = data.iterator();
			while (it.hasNext()) {
				array.put(it.next().toJSON());
			}
			result.put("units", array);
			result.put(Constants.STATUS,Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			processingError = e.getMessage();
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		processing = false;
		return result;
	}

	@Override
	public JSONObject getLanguages() {
		JSONObject result = new JSONObject();
		if (parsing) {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, "Requested languages while parsing");
			return result;
		}
		if (store == null) {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
			return result;
		}
		if (registry == null) {
			try {
				registry = new RegistryParser();
			} catch (IOException e) {
				LOGGER.log(Level.SEVERE, e.getMessage(), e);
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, e.getMessage());
				return result;
			}
		}
		Set<String> codes = store.getLanguages();
		if (codes == null || codes.isEmpty()) {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, "Error getting languages from store");
			return result;
		}
		Iterator<String> it = codes.iterator();
		JSONArray data = new JSONArray();
		
		while (it.hasNext()) {
			String code = it.next();
			data.put(new Language(code, registry.getTagDescription(code)).toJSON());
		}
		result.put("languages", data);
		result.put(Constants.STATUS, Constants.SUCCESS);
		return result;
	}

	@Override
	public JSONObject getProcessingProgress() {
		JSONObject result = new JSONObject();
		if (store != null) {
			if (processing) {
				result.put(Constants.STATUS, Constants.PROCESSING);
			} else {
				if (processingError.isEmpty()) {
					result.put(Constants.STATUS, Constants.COMPLETED);
				} else {
					result.put(Constants.STATUS, Constants.ERROR);
					result.put(Constants.REASON, processingError);
				}
			}
			result.put("count", store.getProcessed());
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject getCount() {
		JSONObject result = new JSONObject();
		if (store != null) {
			result.put("count", store.getCount());
			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject closeFile() {
		if (store != null) {
			try {
				store.close();
				store = null;
				currentFile = null;
				new Thread() {
					@Override
					public void run() {
						System.gc();
					}
				}.start();
				JSONObject result = new JSONObject();
				result.put(Constants.STATUS, Constants.SUCCESS);
				return result;
			} catch (Exception e) {
				LOGGER.log(Level.SEVERE, e.getMessage(), e);
				JSONObject result = new JSONObject();
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, e.getMessage());
				return result;
			}
		}
		JSONObject result = new JSONObject();
		result.put(Constants.STATUS, Constants.ERROR);
		result.put(Constants.REASON, "Null Store");
		return result;
	}

	@Override
	public JSONObject saveData(String id, String lang, String value) {
		JSONObject result = new JSONObject();
		try {
			String updated = store.saveData(id, lang, value);
			result.put(Constants.STATUS, Constants.SUCCESS);
			result.put("data", updated);
			result.put("id", id);
			result.put("lang", lang);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject saveFile(String file) {
		saving = true;
		currentFile = new File(file);
		getIndentation();
		store.setIndentation(indentation);

		savingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.writeFile(currentFile);
					} catch (Exception ex) {
						LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
						savingError = ex.getMessage();
					}
					saving = false;
				}
			}.start();
			JSONObject result = new JSONObject();
			result.put(Constants.STATUS, Constants.SUCCESS);
			return result;
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			JSONObject result = new JSONObject();
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, ex.getMessage());
			return result;
		}
	}

	@Override
	public JSONObject getFileProperties() {
		JSONObject result = new JSONObject();
		if (currentFile != null) {
			Element header = store.getHeader();

			result.put("file", currentFile.getAbsolutePath());

			JSONArray properties = new JSONArray();
			result.put("properties", properties);
			List<Element> propsList = header.getChildren("prop");
			Iterator<Element> propsIt = propsList.iterator();
			while (propsIt.hasNext()) {
				Element prop = propsIt.next();
				JSONArray array = new JSONArray();
				array.put(prop.getAttributeValue("type"));
				array.put(prop.getText());
				properties.put(array);
			}

			JSONArray notes = new JSONArray();
			result.put("notes", notes);
			List<Element> notesList = header.getChildren("note");
			Iterator<Element> notesIt = notesList.iterator();
			while (notesIt.hasNext()) {
				Element note = notesIt.next();
				notes.put(note.getText());
			}

			JSONObject attributes = new JSONObject();
			result.put("attributes", attributes);
			attributes.put("creationtool", header.getAttributeValue("creationtool"));
			attributes.put("creationtoolversion", header.getAttributeValue("creationtoolversion"));
			attributes.put("segtype", header.getAttributeValue("segtype"));
			attributes.put("o_tmf", header.getAttributeValue("o-tmf"));
			attributes.put("adminlang", header.getAttributeValue("adminlang"));
			attributes.put("srclang", header.getAttributeValue("srclang"));
			attributes.put("datatype", header.getAttributeValue("datatype"));

			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, "No file open");
		}
		return result;
	}

	@Override
	public JSONObject getTuData(String id) {
		JSONObject result = new JSONObject();
		Comparator<String[]> comparator = new Comparator<>() {

			@Override
			public int compare(String[] o1, String[] o2) {
				return o1[0].compareTo(o2[0]);
			}

		};
		try {
			Element tu = store.getTu(id);
			if (tu != null) {
				List<String[]> atts = new ArrayList<>();
				List<Attribute> aList = tu.getAttributes();
				Iterator<Attribute> at = aList.iterator();
				while (at.hasNext()) {
					Attribute a = at.next();
					atts.add(new String[] { a.getName(), a.getValue() });
				}
				Collections.sort(atts, comparator);

				List<String[]> props = new ArrayList<>();
				List<Element> pList = tu.getChildren("prop");
				Iterator<Element> pt = pList.iterator();
				while (pt.hasNext()) {
					Element prop = pt.next();
					props.add(new String[] { prop.getAttributeValue("type"), prop.getText() });
				}
				Collections.sort(props, comparator);

				List<String> notes = new ArrayList<>();
				List<Element> nList = tu.getChildren("note");
				Iterator<Element> nt = nList.iterator();
				while (nt.hasNext()) {
					notes.add(nt.next().getText());
				}

				JSONArray propertiesArray = new JSONArray();
				for (int i = 0; i < props.size(); i++) {
					propertiesArray.put(props.get(i));
				}
				result.put("properties", propertiesArray);
				JSONArray attributesArray = new JSONArray();
				for (int i = 0; i < atts.size(); i++) {
					attributesArray.put(atts.get(i));
				}
				result.put("attributes", attributesArray);
				JSONArray notesArray = new JSONArray();
				result.put("notes", notesArray);
				for (int i = 0; i < notes.size(); i++) {
					notesArray.put(notes.get(i));
				}
				result.put(Constants.STATUS, Constants.SUCCESS);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, "null tu");
			}
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject delete(List<String> selected) {
		JSONObject result = new JSONObject();
		try {
			store.delete(selected);
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, ex.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject replaceText(String search, String replace, Language language, boolean regExp) {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.replaceText(search, replace, language, regExp);
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception ex) {
			processing = false;
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, ex.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject insertUnit() {
		JSONObject result = new JSONObject();
		try {
			String id = "tmx" + System.currentTimeMillis();
			store.insertUnit(id);
			result.put(Constants.STATUS, Constants.SUCCESS);
			result.put("id", id);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject getAllLanguages() {
		JSONObject result = new JSONObject();
		try {
			JSONArray array = new JSONArray();
			List<Language> langs = LangUtils.getAllLanguages();
			Iterator<Language> it = langs.iterator();
			while (it.hasNext()) {
				array.put(it.next().toJSON());
			}
			result.put("languages", array);
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (SAXException | IOException | ParserConfigurationException e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject removeUntranslated(Language lang) {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.removeUntranslated(lang);
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			processing = false;
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject addLanguage(Language lang) {
		JSONObject result = new JSONObject();
		try {
			store.addLanguage(lang);
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject removeLanguage(Language lang) {
		JSONObject result = new JSONObject();
		try {
			store.removeLanguage(lang);
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject removeTags() {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.removeTags();
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			processing = false;
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject changeLanguage(Language oldLanguage, Language newLanguage) {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.changeLanguage(oldLanguage, newLanguage);
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject createFile(Language srcLang, Language tgtLang) {
		JSONObject result = new JSONObject();
		try {
			Document doc = new Document(null, "tmx", null, null);
			Element tmx = doc.getRootElement();
			tmx.setAttribute("version", "1.4");
			Element header = new Element("header");
			header.setAttribute("creationdate", TmxUtils.tmxDate());
			header.setAttribute("creationtool", Constants.APPNAME);
			header.setAttribute("creationtoolversion", Constants.VERSION);
			header.setAttribute("datatype", "xml");
			header.setAttribute("segtype", "block");
			header.setAttribute("adminlang", "en");
			header.setAttribute("o-tmf", "unknown");
			header.setAttribute("srclang", srcLang.getCode());
			tmx.addContent(header);
			Element body = new Element("body");
			tmx.addContent(body);
			Element tu = new Element("tu");
			tu.setAttribute("creationdate", TmxUtils.tmxDate());
			tu.setAttribute("creationtool", Constants.APPNAME);
			tu.setAttribute("creationtoolversion", Constants.VERSION);
			body.addContent(tu);
			Element tuv1 = new Element("tuv");
			tuv1.setAttribute("xml:lang", srcLang.getCode());
			Element seg1 = new Element("seg");
			seg1.setText(srcLang.getCode());
			tuv1.addContent(seg1);
			tu.addContent(tuv1);
			Element tuv2 = new Element("tuv");
			tuv2.setAttribute("xml:lang", tgtLang.getCode());
			Element seg2 = new Element("seg");
			seg2.setText(tgtLang.getCode());
			tuv2.addContent(seg2);
			tu.addContent(tuv2);

			File tempFile = File.createTempFile("temp", ".tmx");
			tempFile.deleteOnExit();
			Indenter.indent(tmx, 2);
			XMLOutputter outputter = new XMLOutputter();
			outputter.preserveSpace(true);
			try (FileOutputStream out = new FileOutputStream(tempFile)) {
				outputter.output(doc, out);
			}
			result.put(Constants.STATUS, Constants.SUCCESS);
			result.put("path", tempFile.getAbsolutePath());
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, ex.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject removeDuplicates() {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.removeDuplicates();
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject removeSpaces() {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.removeSpaces();
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject consolidateUnits(Language lang) {
		JSONObject result = new JSONObject();
		processing = true;
		processingError = "";
		try {
			new Thread() {
				@Override
				public void run() {
					try {
						store.consolidateUnits(lang);
					} catch (Exception e) {
						LOGGER.log(Level.SEVERE, e.getMessage(), e);
						processingError = e.getMessage();
					}
					processing = false;
				}
			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			processing = false;
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public String[] setAttributes(String id, String lang, List<String[]> attributes) {
		try {
			if (lang.isEmpty()) {
				store.setTuAttributes(id, attributes);
			} else {
				store.setTuvAttributes(id, lang, attributes);
			}
			return new String[] { Constants.SUCCESS };
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			return new String[] { Constants.ERROR, ex.getMessage() };
		}
	}

	@Override
	public JSONObject getLoadingProgress() {
		JSONObject result = new JSONObject();
		if (store != null) {
			if (parsing) {
				result.put(Constants.STATUS, Constants.LOADING);
			} else {
				result.put(Constants.STATUS, Constants.COMPLETED);
			}
			result.put("count", store.getCount());
			if (!parsingError.isEmpty()) {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, parsingError);
			}
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject getSavingProgress() {
		JSONObject result = new JSONObject();
		if (store != null) {
			if (saving) {
				result.put(Constants.STATUS, Constants.SAVING);
			} else {
				result.put(Constants.STATUS, Constants.COMPLETED);
			}
			result.put("count", store.getSaved());
			if (!savingError.isEmpty()) {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, savingError);
			}
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject splitFile(String file, int parts) {
		JSONObject result = new JSONObject();
		File f = new File(file);
		if (!f.exists()) {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, "File does not exist");
			return result;
		}
		splitting = true;
		splitError = "";
		new Thread() {
			@Override
			public void run() {
				try {
					countStore = new CountStore();
					TMXReader reader = new TMXReader(countStore);
					reader.parse(f);
					long total = countStore.getCount();
					long l = total / parts;
					if (total % parts != 0) {
						l++;
					}
					splitStore = new SplitStore(f, l);
					getIndentation();
					splitStore.setIndentation(indentation);
					countStore = null;
					reader = new TMXReader(splitStore);
					reader.parse(f);
					splitStore.close();
					splitStore = null;
				} catch (Exception ex) {
					if (ex.getMessage() != null) {
						splitError = ex.getMessage();
					} else {
						splitError = "Error splitting files";
					}
				}
				splitting = false;
			}
		}.start();
		result.put(Constants.STATUS, Constants.SUCCESS);
		return result;
	}

	@Override
	public JSONObject getSplitProgress() {
		JSONObject result = new JSONObject();
		if (splitting) {
			if (countStore != null) {
				result.put(Constants.STATUS, Constants.SUCCESS);
				result.put("count", countStore.getCount() + " units counted");
			}
			if (splitStore != null) {
				result.put(Constants.STATUS, Constants.SUCCESS);
				result.put("count", splitStore.getCount() + " units written");
			}
		} else {
			if (splitError.isEmpty()) {
				result.put(Constants.STATUS, Constants.COMPLETED);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, splitError);
			}
		}
		return result;
	}

	@Override
	public JSONObject mergeFiles(String merged, List<String> files) {
		JSONObject result = new JSONObject();
		merging = true;
		mergeError = "";
		new Thread() {
			@Override
			public void run() {
				try {
					getIndentation();
					try (FileOutputStream out = new FileOutputStream(new File(merged))) {
						Element header = new Element("header");
						header.setAttribute("creationdate", TmxUtils.tmxDate());
						header.setAttribute("creationtool", Constants.APPNAME);
						header.setAttribute("creationtoolversion", Constants.VERSION);
						header.setAttribute("datatype", "xml");
						header.setAttribute("segtype", "block");
						header.setAttribute("adminlang", "en");
						header.setAttribute("o-tmf", "unknown");
						header.setAttribute("srclang", "*all*");
						out.write(("<?xml version=\"1.0\" ?>\r\n"
								+ "<!DOCTYPE tmx PUBLIC \"-//LISA OSCAR:1998//DTD for Translation Memory eXchange//EN\" \"tmx14.dtd\">\r\n"
								+ "<tmx version=\"1.4\">\n").getBytes(StandardCharsets.UTF_8));
						out.write((TextUtils.padding(1, indentation) + header.toString() + "\n")
								.getBytes(StandardCharsets.UTF_8));
						out.write((TextUtils.padding(1, indentation) + "<body>\n").getBytes(StandardCharsets.UTF_8));
						mergeStore = new MergeStore(out);
						mergeStore.setIndentation(indentation);
						TMXReader reader = new TMXReader(mergeStore);
						Iterator<String> it = files.iterator();
						while (it.hasNext()) {
							File f = new File(it.next());
							reader.parse(f);
						}
						out.write((TextUtils.padding(1, indentation) + "</body>\n").getBytes(StandardCharsets.UTF_8));
						out.write("</tmx>".getBytes(StandardCharsets.UTF_8));
					}
				} catch (Exception e) {
					LOGGER.log(Level.SEVERE, e.getMessage(), e);
					if (e.getMessage() != null) {
						mergeError = e.getMessage();
					} else {
						mergeError = "Error merging files";
					}
				}
				merging = false;
			}
		}.start();
		result.put(Constants.STATUS, Constants.SUCCESS);
		return result;
	}

	@Override
	public JSONObject getMergeProgress() {
		JSONObject result = new JSONObject();
		if (merging) {
			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			if (mergeError.isEmpty()) {
				result.put(Constants.STATUS, Constants.COMPLETED);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, mergeError);
			}
		}
		return result;
	}

	@Override
	public String[] setProperties(String id, String lang, List<String[]> dataList) {
		try {
			if (lang.isEmpty()) {
				store.setTuProperties(id, dataList);
			} else {
				store.setTuvProperties(id, lang, dataList);
			}
			return new String[] { Constants.SUCCESS };
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			return new String[] { Constants.ERROR, ex.getMessage() };
		}
	}

	@Override
	public String[] setNotes(String id, String lang, List<String> notes) {
		try {
			if (lang.isEmpty()) {
				store.setTuNotes(id, notes);
			} else {
				store.setTuvNotes(id, lang, notes);
			}
			return new String[] { Constants.SUCCESS };
		} catch (Exception ex) {
			LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
			return new String[] { Constants.ERROR, ex.getMessage() };
		}
	}

	@Override
	public JSONObject cleanCharacters(String file) {
		JSONObject result = new JSONObject();
		cleaning = true;
		cleaningError = "";
		new Thread() {
			@Override
			public void run() {
				try {
					TMXCleaner.clean(file);
				} catch (IOException e) {
					LOGGER.log(Level.SEVERE, e.getMessage(), e);
					cleaningError = e.getMessage();
				}
				cleaning = false;
			}
		}.start();
		result.put(Constants.STATUS, Constants.SUCCESS);
		return result;
	}

	@Override
	public JSONObject cleaningProgress() {
		JSONObject result = new JSONObject();
		if (cleaning) {
			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			if (cleaningError.isEmpty()) {
				result.put(Constants.STATUS, Constants.COMPLETED);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, cleaningError);
			}
		}
		return result;
	}

	@Override
	public JSONObject setSrcLanguage(Language lang) {
		JSONObject result = new JSONObject();
		if (store != null) {
			Element header = store.getHeader();
			header.setAttribute("srclang", lang.getCode());
			store.storeHeader(header);
			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject getSrcLanguage() {
		JSONObject result = new JSONObject();
		if (store != null) {
			Element header = store.getHeader();
			String code = header.getAttributeValue("srclang");
			result.put(Constants.STATUS, Constants.SUCCESS);
			if ("*all*".equals(code)) {
				result.put("srcLang", code);
				result.put(Constants.STATUS, Constants.SUCCESS);
			} else {
				try {
					Language l = LangUtils.getLanguage(code);
					if (l != null) {
						result.put("srcLang", l.getCode());
						result.put(Constants.STATUS, Constants.SUCCESS);
					} else {
						result.put(Constants.STATUS, Constants.ERROR);
						result.put(Constants.REASON, "File has invalid source language: " + code);
					}
				} catch (IOException e) {
					result.put(Constants.STATUS, Constants.ERROR);
					result.put(Constants.REASON, e.getMessage());
				}
			}
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject exportDelimited(String file) {
		JSONObject result = new JSONObject();
		exporting = true;
		exportingError = "";
		try {
			new Thread() {

				@Override
				public void run() {
					try {
						store.exportDelimited(file);
					} catch (Exception ex) {
						LOGGER.log(Level.SEVERE, ex.getMessage(), ex);
						exportingError = ex.getMessage();
					}
					exporting = false;
				}

			}.start();
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject exportProgress() {
		JSONObject result = new JSONObject();
		if (store != null) {
			if (exporting) {
				result.put(Constants.STATUS, Constants.SUCCESS);
			} else {
				if (exportingError.isEmpty()) {
					result.put(Constants.STATUS, Constants.COMPLETED);
				} else {
					result.put(Constants.STATUS, Constants.ERROR);
					result.put(Constants.REASON, exportingError);
				}
			}
		} else {
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, Constants.NULLSTORE);
		}
		return result;
	}

	@Override
	public JSONObject getTuvData(String id, String lang) {
		JSONObject result = new JSONObject();
		try {
			Element tuv = store.getTuv(id, lang);
			if (tuv != null) {
				List<String[]> atts = new ArrayList<>();
				List<Attribute> aList = tuv.getAttributes();
				Iterator<Attribute> at = aList.iterator();
				while (at.hasNext()) {
					Attribute a = at.next();
					atts.add(new String[] { a.getName(), a.getValue() });
				}

				List<String[]> props = new ArrayList<>();
				List<Element> pList = tuv.getChildren("prop");
				Iterator<Element> pt = pList.iterator();
				while (pt.hasNext()) {
					Element prop = pt.next();
					props.add(new String[] { prop.getAttributeValue("type"), prop.getText() });
				}

				List<String> notes = new ArrayList<>();
				List<Element> nList = tuv.getChildren("note");
				Iterator<Element> nt = nList.iterator();
				while (nt.hasNext()) {
					notes.add(nt.next().getText());
				}

				JSONArray propertiesArray = new JSONArray();
				for (int i = 0; i < props.size(); i++) {
					propertiesArray.put(props.get(i));
				}
				result.put("properties", propertiesArray);
				JSONArray attributesArray = new JSONArray();
				for (int i = 0; i < atts.size(); i++) {
					attributesArray.put(atts.get(i));
				}
				result.put("attributes", attributesArray);
				JSONArray notesArray = new JSONArray();
				result.put("notes", notesArray);
				for (int i = 0; i < notes.size(); i++) {
					notesArray.put(notes.get(i));
				}
				result.put(Constants.STATUS, Constants.SUCCESS);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, "null tuv");
			}
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject validateFile(String file) {
		JSONObject result = new JSONObject();
		validating = true;
		validatingError = "";
		new Thread() {
			@Override
			public void run() {
				try {
					TMXValidator validator = new TMXValidator();
					validator.validate(new File(file));
				} catch (IOException | SAXException | ParserConfigurationException e) {
					LOGGER.log(Level.SEVERE, e.getMessage(), e);
					validatingError = e.getMessage();
				}
				validating = false;
			}
		}.start();
		result.put(Constants.STATUS, Constants.SUCCESS);
		return result;
	}

	@Override
	public JSONObject validatingProgress() {
		JSONObject result = new JSONObject();
		if (validating) {
			result.put(Constants.STATUS, Constants.SUCCESS);
		} else {
			if (validatingError.isEmpty()) {
				result.put(Constants.STATUS, Constants.COMPLETED);
			} else {
				result.put(Constants.STATUS, Constants.ERROR);
				result.put(Constants.REASON, validatingError);
			}
		}
		return result;
	}

	@Override
	public JSONObject getCharsets() {
		JSONObject result = new JSONObject();
		TreeMap<String, Charset> charsets = new TreeMap<>(Charset.availableCharsets());
		Set<String> keys = charsets.keySet();
		JSONArray codes = new JSONArray();
		Iterator<String> i = keys.iterator();
		while (i.hasNext()) {
			Charset cset = charsets.get(i.next());
			codes.put(cset.name());
		}
		result.put("charsets", codes);
		result.put(Constants.STATUS,Constants.SUCCESS);
		return result;
	}

	@Override
	public String[] previewCsv(String csvFile, List<String> langs, String charSet, String columsSeparator,
			String textDelimiter) {
		List<String> lines = new ArrayList<>();
		ArrayList<String> languages = new ArrayList<>();
		if (langs != null) {
			languages.addAll(langs);
		}
		try (InputStreamReader input = new InputStreamReader(new FileInputStream(csvFile), charSet)) {
			try (BufferedReader buffer = new BufferedReader(input)) {
				String line = "";
				while ((line = buffer.readLine()) != null) {
					lines.add(line);
					if (lines.size() > 10) {
						break;
					}
				}
			}
		} catch (IOException ioe) {
			LOGGER.log(Level.SEVERE, "Error reading CSV", ioe);
			return new String[] { Constants.ERROR, "Error reading CSV file" };
		}

		byte[] feff = { -1, -2 }; // UTF-16BE
		byte[] fffe = { -2, -1 }; // UTF-16LE
		byte[] efbbbf = { -17, -69, -65 }; // UTF-8

		try {
			byte[] array = lines.get(0).getBytes(charSet);
			if (array[0] == fffe[0] && array[1] == fffe[1]) {
				String line = lines.get(0).substring(1);
				lines.set(0, line);
			}
			if (array[0] == feff[0] && array[1] == feff[1]) {
				String line = lines.get(0).substring(1);
				lines.set(0, line);
			}
			if (array[0] == efbbbf[0] && array[1] == efbbbf[1] && array[2] == efbbbf[2]) {
				String line = lines.get(0).substring(1);
				lines.set(0, line);
			}
		} catch (UnsupportedEncodingException uee) {
			LOGGER.log(Level.SEVERE, "Error reading CSV", uee);
			return new String[] { Constants.ERROR, "Error reading CSV file" };
		}
		int cols = 0;

		StringBuilder builder = new StringBuilder();
		if (delimitersOk(lines, columsSeparator, textDelimiter)) {
			if (languages.isEmpty()) {
				String line = lines.get(0);
				String[] parts = TextUtils.split(line, columsSeparator);
				try {
					boolean hasLanguages = true;
					for (int i = 0; i < parts.length; i++) {
						String code = parts[i];
						if (!textDelimiter.isEmpty()) {
							code = code.substring(1);
							code = code.substring(0, code.length() - 1);
						}
						if (LangUtils.getLanguage(code) == null) {
							hasLanguages = false;
							break;
						}
					}
					if (hasLanguages) {
						for (int i = 0; i < parts.length; i++) {
							String code = parts[i];
							if (!textDelimiter.isEmpty()) {
								code = code.substring(1);
								code = code.substring(0, code.length() - 1);
							}
							languages.add(code);
						}
					}
				} catch (IOException ex) {
					LOGGER.log(Level.SEVERE, "Error checking CSV languages", ex);
					return new String[] { Constants.ERROR, "Error checking CSV languages" };
				}
			}
			builder.append("<table style='border-collapse:collapse; margin:0px;'>");
			if (!languages.isEmpty()) {
				builder.append("<tr>");
				Iterator<String> it = languages.iterator();
				while (it.hasNext()) {
					builder.append(
							"<td style='border:1px solid #eeeeee; padding:1px; margin:0px; font-weight: bold; background: #80cbc4;'>");
					String cell = it.next();
					builder.append(TextUtils.cleanString(cell));
					builder.append("</td>");
				}
				builder.append("</tr>");
			}
			Iterator<String> it = lines.iterator();
			while (it.hasNext()) {
				String line = it.next();
				String[] parts = TextUtils.split(line, columsSeparator);
				cols = parts.length;
				builder.append("<tr>");
				for (int i = 0; i < parts.length; i++) {
					builder.append("<td style='border:1px solid #eeeeee; padding:1px; margin:0px;'>");
					String cell = parts[i];
					if (!textDelimiter.isEmpty()) {
						cell = cell.substring(1);
						cell = cell.substring(0, cell.length() - 1);
					}
					if (cell.length() > 25) {
						cell = cell.substring(0, 25) + "...";
					}
					builder.append(TextUtils.cleanString(cell));
					builder.append("</td>");
				}
				builder.append("</tr>");
			}
			builder.append("</table>");

		} else {
			builder.append("<pre>");
			for (int i = 0; i < lines.size(); i++) {
				builder.append(lines.get(i));
				builder.append('\n');
			}
			builder.append("</pre>");
		}
		return new String[] { Constants.SUCCESS, builder.toString(), "" + cols, "" + languages.size(),
				langsList(languages) };
	}

	@Override
	public String[] convertCsv(String csvFile, String tmxFile, List<String> languages, String charSet,
			String columsSeparator, String textDelimiter) {
		try {
			TMXConverter.csv2tmx(csvFile, tmxFile, languages, charSet, columsSeparator, textDelimiter);
			return new String[] { Constants.SUCCESS };
		} catch (IOException e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			return new String[] { Constants.ERROR, e.getMessage() };
		}
	}

	@Override
	public JSONObject getIndentation() {
		JSONObject result = new JSONObject();
		File home = getPreferencesFolder();
		if (!home.exists()) {
			home.mkdirs();
		}
		File preferences = new File(home, "preferences.json");
		try {
			if (!preferences.exists()) {
				JSONObject prefs = new JSONObject();
				prefs.put("theme", "system");
				prefs.put("indentation", 2);
				try (FileOutputStream output = new FileOutputStream(preferences)) {
					output.write(prefs.toString().getBytes(StandardCharsets.UTF_8));
				}
			}
			try (FileReader input = new FileReader(preferences)) {
				try (BufferedReader reader = new BufferedReader(input)) {
					StringBuilder builder = new StringBuilder();
					String line = "";
					while ((line = reader.readLine()) != null) {
						builder.append(line);
					}
					JSONObject json = new JSONObject(builder.toString());
					indentation = json.getInt("indentation");
					result.put("indentation", indentation);
				}
			}
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (IOException e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	@Override
	public JSONObject saveIndentation(int value) {
		JSONObject result = new JSONObject();
		File home = getPreferencesFolder();
		if (!home.exists()) {
			home.mkdirs();
		}
		File preferences = new File(home, "preferences.json");
		try {
			if (!preferences.exists()) {
				JSONObject prefs = new JSONObject();
				prefs.put("theme", "system");
				prefs.put("indentation", 2);
				try (FileOutputStream output = new FileOutputStream(preferences)) {
					output.write(prefs.toString().getBytes(StandardCharsets.UTF_8));
				}
			}
			JSONObject json = null;
			try (FileReader input = new FileReader(preferences)) {
				try (BufferedReader reader = new BufferedReader(input)) {
					StringBuilder builder = new StringBuilder();
					String line = "";
					while ((line = reader.readLine()) != null) {
						builder.append(line);
					}
					json = new JSONObject(builder.toString());
					json.put("indentation", value);

				}
			}
			try (FileOutputStream output = new FileOutputStream(preferences)) {
				output.write(json.toString().getBytes(StandardCharsets.UTF_8));
			}
			indentation = value;
			if (store != null) {
				store.setIndentation(indentation);
			}
			result.put(Constants.STATUS, Constants.SUCCESS);
		} catch (IOException e) {
			LOGGER.log(Level.SEVERE, e.getMessage(), e);
			result.put(Constants.STATUS, Constants.ERROR);
			result.put(Constants.REASON, e.getMessage());
		}
		return result;
	}

	public static String encodeURIcomponent(String s) {
		StringBuilder o = new StringBuilder();
		for (char ch : s.toCharArray()) {
			if (isUnsafe(ch)) {
				o.append('%');
				o.append(toHex(ch / 16));
				o.append(toHex(ch % 16));
			} else {
				o.append(ch);
			}
		}
		return o.toString();
	}

	private static char toHex(int ch) {
		return (char) (ch < 10 ? '0' + ch : 'A' + ch - 10);
	}

	private static boolean isUnsafe(char ch) {
		if (ch > 128 || ch < 0) {
			return true;
		}
		return " %$&+,/:;=?@<>#%".indexOf(ch) >= 0;
	}

	private static boolean delimitersOk(List<String> lines, String columsSeparator, String textDelimiter) {
		int columns = -1;
		Iterator<String> it = lines.iterator();
		boolean sameDelimiter = true;
		String delimiter = "";
		while (it.hasNext()) {
			String line = it.next();
			String[] parts = TextUtils.split(line, columsSeparator);
			if (!textDelimiter.isEmpty()) {
				for (int i = 0; i < parts.length; i++) {
					if (!parts[i].startsWith(textDelimiter)) {
						return false;
					}
					if (!parts[i].endsWith(textDelimiter)) {
						return false;
					}
				}
			} else if (sameDelimiter) {
				for (int i = 0; i < parts.length; i++) {
					if (parts[i].isEmpty()) {
						sameDelimiter = false;
						break;
					}
					if (delimiter.isEmpty()) {
						delimiter = "" + parts[i].charAt(0);
					}
					if (!parts[i].startsWith(delimiter)) {
						sameDelimiter = false;
						break;
					}
					if (!parts[i].endsWith(delimiter)) {
						sameDelimiter = false;
						break;
					}
				}
			}
			if (columns == -1) {
				columns = parts.length;
			}
			if (columns != parts.length) {
				return false;
			}
			if (columns == 1) {
				return false;
			}
		}
		return !(textDelimiter.isEmpty() && sameDelimiter);
	}

	private static String langsList(List<String> languages) {
		if (languages.isEmpty()) {
			return "";
		}
		StringBuilder builder = new StringBuilder();
		builder.append(languages.get(0));
		for (int i = 1; i < languages.size(); i++) {
			builder.append('|');
			builder.append(languages.get(i));
		}
		return builder.toString();
	}

	public Language getLanguage(String code) throws IOException {
		if (registry == null) {
			registry = new RegistryParser();
		}
		return new Language(code, registry.getTagDescription(code));
	}

}
