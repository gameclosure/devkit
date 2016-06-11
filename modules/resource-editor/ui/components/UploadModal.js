import path from 'path';
import React from 'react';
import Promise from 'bluebird';
import classnames from 'classnames';
import FilePreview from './FilePreview';
import Modal from './Modal';

class FileLineItem extends React.Component {
  constructor() {
    super();
    this.state = {};
  }

  componentWillReceiveProps(props) {
    this.updateStatus(props.file);
  }

  componentDidMount() {
    this.updateStatus(this.props.file);
  }

  handleSkip = () => {
    this.props.file.skip = !this.props.file.skip;
    this.setState({skip: this.props.file.skip});
  }

  updateStatus(file) {
    const fs = this.props.fs;
    const folder = this.props.folder;
    fs.exists(path.join(folder.path, file.path))
      .then(exists => {
        if (file.path === this.props.file.path) {
          this.setState({exists});
        }
      });
  }

  render() {
    const file = this.props.file;
    return <div className={classnames('FileLineItem', 'row', this.state.skip && 'skip', this.props.className)}>
      <FilePreview className="small" fs={this.props.fs} file={file} />
      <label className="flex">{file.path}</label>
      <button onClick={this.handleSkip}>{this.state.skip ? 'upload' : 'skip'}</button>
      <div ref="status" className="status">
        {this.state.skip
          ? <i className="fa fa-times" />
          : !this.state.exists
            ? <i className="fa fa-check" />
            : <div>
                <div className="warning">overwrite</div>
                <div className="message">(file already exists)</div>
              </div>}
      </div>
    </div>;
  }
}

export default class UploadModal extends React.Component {
  constructor() {
    super();
    this.state = {};
  }

  upload() {
    const fs = this.props.fs;
    const folder = this.props.folder;
    const files = this.props.files;

    return Promise.resolve(files)
        .filter(file => !/^\./.test(file.data.name))
        .map(file => {
          const destPath = path.join(folder.path, file.path);
          console.log(file.path, '->', destPath);
          return fs.outputFile(destPath, file.data);
        })
        .all();
  }

  handleUpload = () => {
    this.upload()
      .finally(() => Modal.close());
  }

  handleClose = () => {
    Modal.close();
  }

  render() {
    const folder = this.props.folder;
    const files = this.props.files;
    const fs = this.props.fs;

    return <div className="UploadModal modal">
      <div className="title row">
        <div className="flex">Upload Files to "{folder.path}"</div>
        <i className="fa fa-times" onClick={this.handleClose} />
      </div>
      <div className="contents">
        <div className="description">The following files will be uploaded:</div>
        <div className="FileList">
          {files.map(file => <FileLineItem key={file.path} folder={folder} fs={fs} file={file} />)}
        </div>
      </div>
      <div className="footer">
        <div className="flex" />
        <button className="primary" onClick={this.handleUpload}>upload <i className="fa fa-arrow-up" /></button>
      </div>
    </div>;
  }
}
