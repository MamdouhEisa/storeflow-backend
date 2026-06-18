const Setting = require('../models/Setting');

const getSettings = async (req, res) => {
  try {
    const settings = await Setting.find();
    const result = {};
    settings.forEach((s) => { result[s.key] = s.value; });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'value is required' });
    }
    const setting = await Setting.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: { [setting.key]: setting.value } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkUpdateSettings = async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'Expected non-empty array of { key, value }' });
    }
    const ops = entries.map(({ key, value }) => ({
      updateOne: {
        filter: { key },
        update: { key, value },
        upsert: true
      }
    }));
    await Setting.bulkWrite(ops);
    const settings = await Setting.find();
    const result = {};
    settings.forEach((s) => { result[s.key] = s.value; });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSetting, bulkUpdateSettings };
